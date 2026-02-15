import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, client } from '../../lib/db/drizzle';
import { users } from '../../lib/db/schema';

function parseArgs(args: string[]) {
  let dryRun = false;
  let userEmail: string | null = null;

  for (const arg of args) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg.startsWith('--user-email=')) {
      const value = arg.split('=').slice(1).join('=').trim().toLowerCase();
      if (!value) {
        throw new Error('`--user-email` must include a non-empty email value.');
      }
      userEmail = value;
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}. Supported args: --dry-run, --user-email=<email>`
    );
  }

  return { dryRun, userEmail };
}

async function main() {
  const { dryRun, userEmail } = parseArgs(process.argv.slice(2));
  const targetCondition = userEmail
    ? and(isNull(users.deletedAt), eq(users.email, userEmail))
    : isNull(users.deletedAt);

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(targetCondition);

  const preview = await db
    .select({
      id: users.id,
      email: users.email,
      planName: users.planName,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      stripeProductId: users.stripeProductId,
      subscriptionStatus: users.subscriptionStatus,
    })
    .from(users)
    .where(targetCondition)
    .limit(20);

  console.log(
    `Matched ${count} active user(s)${userEmail ? ` for ${userEmail}` : ''}.`
  );

  if (preview.length > 0) {
    console.log('Preview (up to 20 rows):');
    console.table(preview);
  } else {
    console.log('No matching users found.');
  }

  if (dryRun) {
    console.log('Dry run mode enabled. No data was changed.');
    return;
  }

  const updatedUsers = await db
    .update(users)
    .set({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: 'free',
      subscriptionStatus: null,
      subscriptionPeriodStart: null,
      subscriptionPeriodEnd: null,
      updatedAt: new Date(),
    })
    .where(targetCondition)
    .returning({
      id: users.id,
      email: users.email,
    });

  console.log(`Reset Stripe links for ${updatedUsers.length} user(s).`);
}

main()
  .catch((error) => {
    console.error('Failed to reset Stripe links:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
