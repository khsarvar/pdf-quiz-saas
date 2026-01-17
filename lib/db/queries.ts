import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  users,
  documents,
  quizzes,
  questions,
  extractions,
  documentChunks,
  quizAttempts,
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

// User subscription queries
export async function getUserByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateUserSubscription(
  userId: number,
  subscriptionData: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
    subscriptionPeriodStart?: Date | null;
    subscriptionPeriodEnd?: Date | null;
  }
) {
  await db
    .update(users)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

// Document queries
export async function getDocumentsForUser() {
  const user = await getUser();
  if (!user) {
    return [];
  }

  const result = await db
    .select({
      id: documents.id,
      userId: documents.userId,
      filename: documents.filename,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
      status: documents.status,
      pageCount: documents.pageCount,
      createdAt: documents.createdAt,
      quizId: quizzes.id,
      quizStatus: quizzes.status,
      quizCreatedAt: quizzes.createdAt,
    })
    .from(documents)
    .leftJoin(quizzes, eq(quizzes.documentId, documents.id))
    .where(eq(documents.userId, user.id))
    .orderBy(desc(documents.createdAt), desc(quizzes.createdAt));

  // Group by document ID and take the first quiz (most recent) if multiple exist
  const documentsMap = new Map();
  for (const row of result) {
    if (!documentsMap.has(row.id)) {
      documentsMap.set(row.id, {
        id: row.id,
        userId: row.userId,
        filename: row.filename,
        storageKey: row.storageKey,
        mimeType: row.mimeType,
        status: row.status,
        pageCount: row.pageCount,
        createdAt: row.createdAt,
        quizId: row.quizId,
        quizStatus: row.quizStatus,
      });
    }
  }

  return Array.from(documentsMap.values());
}

export async function getDocumentById(documentId: number) {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// Quiz queries
export async function getQuizzesForUser() {
  const user = await getUser();
  if (!user) {
    return [];
  }

  return await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.userId, user.id))
    .orderBy(desc(quizzes.createdAt));
}

export async function getQuizForDocument(documentId: number) {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.documentId, documentId), eq(quizzes.userId, user.id)))
    .orderBy(desc(quizzes.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getQuizById(quizId: number) {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, user.id)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getQuestionsForQuiz(quizId: number) {
  return await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(questions.id);
}

export async function getQuizWithQuestions(quizId: number) {
  const quiz = await getQuizById(quizId);
  if (!quiz) {
    return null;
  }

  const questionsList = await getQuestionsForQuiz(quizId);
  return {
    ...quiz,
    questions: questionsList,
  };
}

// Extraction queries
export async function getExtractionForDocument(documentId: number) {
  const result = await db
    .select()
    .from(extractions)
    .where(eq(extractions.documentId, documentId))
    .orderBy(desc(extractions.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// Document chunk queries
export async function getChunksForDocument(documentId: number) {
  return await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);
}

export async function getChunksForExtraction(extractionId: number) {
  return await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.extractionId, extractionId))
    .orderBy(documentChunks.chunkIndex);
}

export async function hasChunksForExtraction(extractionId: number): Promise<boolean> {
  const result = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.extractionId, extractionId))
    .limit(1);

  return result.length > 0;
}

export async function hasChunksForDocument(documentId: number): Promise<boolean> {
  const result = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .limit(1);

  return result.length > 0;
}

// Quiz attempt queries
export async function createQuizAttempt(
  quizId: number,
  userId: number,
  answers: Record<number, number>,
  score: number
) {
  const result = await db
    .insert(quizAttempts)
    .values({
      quizId,
      userId,
      answers: answers as any,
      score,
      completedAt: new Date(),
    })
    .returning();

  return result[0];
}

export async function getQuizAttempts(quizId: number) {
  const user = await getUser();
  if (!user) {
    return [];
  }

  // Verify user owns the quiz
  const quiz = await getQuizById(quizId);
  if (!quiz) {
    return [];
  }

  return await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, user.id)))
    .orderBy(desc(quizAttempts.completedAt));
}

export async function getQuizAttemptById(attemptId: number) {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, user.id)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}
