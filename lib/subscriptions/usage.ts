import { db } from '@/lib/db/drizzle';
import { users, usageTracking, documents, quizzes } from '@/lib/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { PLANS, type Plan, type PlanName } from './plans';
import type { User } from '@/lib/db/schema';

export function getUserPlan(user: User): PlanName {
  const planName = (user.planName || 'free').toLowerCase() as PlanName;
  return planName in PLANS ? planName : 'free';
}

export function getPlanConfig(user: User): Plan {
  return PLANS[getUserPlan(user)];
}

/**
 * Get or create current usage period for a user
 * For free plan, returns lifetime usage (no period)
 * For paid plans, returns current billing period usage
 */
export async function getCurrentUsagePeriod(user: User) {
  const plan = getUserPlan(user);
  
  // Free plan: no period, track lifetime usage
  if (plan === 'free') {
    // For free plan, we don't track in usage_tracking table
    // We'll count directly from quizzes table when needed
    return {
      quizGenerations: 0,
      periodStart: user.createdAt,
      periodEnd: null,
    };
  }

  // Paid plans: use subscription period
  if (!user.subscriptionPeriodStart || !user.subscriptionPeriodEnd) {
    // No period set yet, create one
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    // Update user with period dates
    await db
      .update(users)
      .set({
        subscriptionPeriodStart: now,
        subscriptionPeriodEnd: periodEnd,
      })
      .where(eq(users.id, user.id));

    // Create usage tracking record
    const [usage] = await db
      .insert(usageTracking)
      .values({
        userId: user.id,
        periodStart: now,
        periodEnd: periodEnd,
        quizGenerations: 0,
      })
      .returning();

    return usage;
  }

  // Check if current period is still valid
  const now = new Date();
  if (now >= user.subscriptionPeriodStart && now <= user.subscriptionPeriodEnd) {
    // Get existing usage tracking for this period
    const [usage] = await db
      .select()
      .from(usageTracking)
      .where(
        and(
          eq(usageTracking.userId, user.id),
          gte(usageTracking.periodEnd, now),
          lte(usageTracking.periodStart, now)
        )
      )
      .orderBy(desc(usageTracking.createdAt))
      .limit(1);

    if (usage) {
      return usage;
    }

    // Create if doesn't exist
    const [newUsage] = await db
      .insert(usageTracking)
      .values({
        userId: user.id,
        periodStart: user.subscriptionPeriodStart,
        periodEnd: user.subscriptionPeriodEnd,
        quizGenerations: 0,
      })
      .returning();

    return newUsage;
  }

  // Period expired, create new one
  const periodStart = new Date(now);
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db
    .update(users)
    .set({
      subscriptionPeriodStart: periodStart,
      subscriptionPeriodEnd: periodEnd,
    })
    .where(eq(users.id, user.id));

  const [newUsage] = await db
    .insert(usageTracking)
    .values({
      userId: user.id,
      periodStart: periodStart,
      periodEnd: periodEnd,
      quizGenerations: 0,
    })
    .returning();

  return newUsage;
}

/**
 * Check if user can generate a quiz
 */
export async function checkQuizGenerationLimit(user: User): Promise<{ allowed: boolean; error?: string }> {
  const plan = getPlanConfig(user);
  
  if (plan.quizGenerations === -1) {
    return { allowed: true };
  }

  // Free plan: count only successful quizzes (status='ready')
  if (getUserPlan(user) === 'free') {
    const successfulQuizzes = await db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.userId, user.id),
          eq(quizzes.status, 'ready')
        )
      );

    const count = successfulQuizzes.length;
    if (count >= plan.quizGenerations) {
      return {
        allowed: false,
        error: `You've reached your limit of ${plan.quizGenerations} quiz generations. Upgrade to continue.`,
      };
    }
    return { allowed: true };
  }

  // Paid plans: check period usage (only counts successful quizzes)
  const usage = await getCurrentUsagePeriod(user);
  if (usage.quizGenerations >= plan.quizGenerations) {
    return {
      allowed: false,
      error: `You've reached your limit of ${plan.quizGenerations} quiz generations for this period. Your limit will reset on ${usage.periodEnd ? new Date(usage.periodEnd).toLocaleDateString() : 'your next billing date'}.`,
    };
  }

  return { allowed: true };
}

/**
 * Increment quiz generation count
 */
export async function incrementQuizGeneration(user: User) {
  const plan = getUserPlan(user);
  
  if (plan === 'free') {
    // Free plan: no tracking needed, just count from quizzes table
    return;
  }

  const usage = await getCurrentUsagePeriod(user);
  if (!('id' in usage)) {
    return;
  }
  await db
    .update(usageTracking)
    .set({
      quizGenerations: usage.quizGenerations + 1,
      updatedAt: new Date(),
    })
    .where(eq(usageTracking.id, usage.id));
}

/**
 * Reset usage period (called on subscription renewal)
 */
export async function resetUsagePeriod(user: User) {
  const plan = getUserPlan(user);
  
  if (plan === 'free') {
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db
    .update(users)
    .set({
      subscriptionPeriodStart: now,
      subscriptionPeriodEnd: periodEnd,
    })
    .where(eq(users.id, user.id));

  await db
    .insert(usageTracking)
    .values({
      userId: user.id,
      periodStart: now,
      periodEnd: periodEnd,
      quizGenerations: 0,
    });
}

/**
 * Get current usage stats for a user
 */
export async function getUserUsageStats(user: User) {
  const plan = getPlanConfig(user);
  const planName = getUserPlan(user);

  if (planName === 'free') {
    // Count only successful quizzes (status='ready')
    const successfulQuizzes = await db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.userId, user.id),
          eq(quizzes.status, 'ready')
        )
      );

    return {
      plan: planName,
      quizGenerations: {
        used: successfulQuizzes.length,
        limit: plan.quizGenerations,
        remaining: Math.max(0, plan.quizGenerations - successfulQuizzes.length),
      },
      periodEnd: null,
    };
  }

  const usage = await getCurrentUsagePeriod(user);
  return {
    plan: planName,
    quizGenerations: {
      used: usage.quizGenerations || 0,
      limit: plan.quizGenerations,
      remaining: Math.max(0, plan.quizGenerations - (usage.quizGenerations || 0)),
    },
    periodEnd: usage.periodEnd,
  };
}
