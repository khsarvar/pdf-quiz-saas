import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  documents,
  quizzes,
  questions,
  users,
  type NewQuiz,
  type NewQuestion,
} from '@/lib/db/schema';
import { getUser, getDocumentById, hasChunksForDocument } from '@/lib/db/queries';
import { generateQuestions } from '@/lib/generation';
import { eq, and } from 'drizzle-orm';
import { checkQuizGenerationLimit, incrementQuizGeneration, getPlanConfig } from '@/lib/subscriptions/usage';

/**
 * Process quiz generation asynchronously: generate questions and save them
 */
export async function generateQuizAsync(
  quizId: number,
  documentId: number,
  questionCount: number
): Promise<void> {
  try {
    console.log('[quiz-generation] Starting quiz generation', { quizId, documentId });

    // Generate questions using LLM
    const generatedQuestions = await generateQuestions(documentId, questionCount);
    console.log('[quiz-generation] Generated questions', { quizId, questionCount: generatedQuestions.length });

    // Create questions
    const newQuestions: NewQuestion[] = generatedQuestions.map((q) => ({
      quizId,
      type: 'multiple_choice',
      prompt: q.prompt,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
    }));

    await db.insert(questions).values(newQuestions);
    console.log('[quiz-generation] Saved questions to database', { quizId, questionCount: newQuestions.length });

    // Update quiz status to ready
    await db
      .update(quizzes)
      .set({ status: 'ready' })
      .where(eq(quizzes.id, quizId));

    // Increment usage count only on successful completion (for paid plans)
    // Fetch user from quiz record
    const [quiz] = await db
      .select({ userId: quizzes.userId })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (quiz) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, quiz.userId))
        .limit(1);

      if (user) {
        await incrementQuizGeneration(user);
      }
    }

    console.log('[quiz-generation] Quiz generation complete', { quizId });
  } catch (error) {
    console.error('[quiz-generation] Error generating quiz:', error);
    // Update quiz status to failed
    await db
      .update(quizzes)
      .set({ status: 'failed' })
      .where(eq(quizzes.id, quizId));
    throw error;
  }
}

/**
 * Start quiz generation with a user object (for background processing)
 * This version doesn't require request context
 */
export async function startQuizGenerationForUser(
  documentId: number,
  user: { id: number }
): Promise<{ quizId: number } | { error: string }> {
  // Fetch full user object from database
  const [fullUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!fullUser) {
    return { error: 'User not found' };
  }

  // Verify document belongs to user
  const document = await getDocumentById(documentId);
  if (!document) {
    return { error: 'Document not found' };
  }

  if (document.userId !== fullUser.id) {
    return { error: 'Unauthorized' };
  }

  // Check if document is ready for quiz generation
  if (document.status !== 'ready' && document.status !== 'failed') {
    if (document.status === 'processing') {
      return { error: 'Document is still being processed. Please wait for processing to complete.' };
    }
    return { error: `Document status is ${document.status}. Cannot generate quiz.` };
  }

  // Verify that chunks exist (document has been processed)
  const chunksExist = await hasChunksForDocument(documentId);
  if (!chunksExist) {
    return { error: 'Document has not been processed yet. Please wait for processing to complete.' };
  }

  // Check if user can regenerate quizzes (paid plans only)
  const plan = getPlanConfig(fullUser);
  
  // Check for existing quiz with status 'generating' (race condition protection)
  const generatingQuiz = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.documentId, documentId),
        eq(quizzes.userId, fullUser.id),
        eq(quizzes.status, 'generating')
      )
    )
    .limit(1);

  if (generatingQuiz.length > 0) {
    // Quiz is already generating, return existing quiz ID
    return { quizId: generatingQuiz[0].id };
  }

  // Check for existing failed quiz (allow retry)
  const failedQuiz = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.documentId, documentId),
        eq(quizzes.userId, fullUser.id),
        eq(quizzes.status, 'failed')
      )
    )
    .limit(1);

  // If failed quiz exists, allow retry without checking for 'ready' quiz restriction
  if (failedQuiz.length === 0) {
    // Check for existing completed quiz (only if no failed quiz exists)
    const existingQuiz = await db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.documentId, documentId),
          eq(quizzes.userId, fullUser.id),
          eq(quizzes.status, 'ready')
        )
      )
      .limit(1);

    if (existingQuiz.length > 0 && !plan.canRegenerateQuizzes) {
      return { error: 'You can only generate one quiz per document on the free plan. Upgrade to regenerate quizzes.' };
    }
  }

  // Check quiz generation limit
  const limitCheck = await checkQuizGenerationLimit(fullUser);
  if (!limitCheck.allowed) {
    return { error: limitCheck.error || 'Quiz generation limit reached' };
  }

  // Create quiz record with status 'generating'
  const newQuiz: NewQuiz = {
    userId: fullUser.id,
    documentId,
    title: `Quiz: ${document.filename}`,
    status: 'generating',
  };

  const [createdQuiz] = await db
    .insert(quizzes)
    .values(newQuiz)
    .returning();

  if (!createdQuiz) {
    return { error: 'Failed to create quiz record' };
  }

  // Note: incrementQuizGeneration is now called in generateQuizAsync after successful completion

  // Process quiz generation in background: generate questions
  // We do this asynchronously so the function can return quickly
  const questionCount = plan.questionsPerQuiz;
  generateQuizAsync(createdQuiz.id, documentId, questionCount).catch((error) => {
    console.error('Error generating quiz:', error);
    // Error handling is done in generateQuizAsync
  });

  return { quizId: createdQuiz.id };
}

/**
 * Start quiz generation - validates and creates quiz, returns quiz ID
 * This function can be called from both API routes and server actions
 */
export async function startQuizGeneration(documentId: number): Promise<{ quizId: number } | { error: string }> {
  // Authenticate user
  const user = await getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  return startQuizGenerationForUser(documentId, user);

  // Verify document belongs to user
  const document = await getDocumentById(documentId);
  if (!document) {
    return { error: 'Document not found' };
  }

  if (document.userId !== user.id) {
    return { error: 'Unauthorized' };
  }

  // Check if document is ready for quiz generation
  if (document.status !== 'ready' && document.status !== 'failed') {
    if (document.status === 'processing') {
      return { error: 'Document is still being processed. Please wait for processing to complete.' };
    }
    return { error: `Document status is ${document.status}. Cannot generate quiz.` };
  }

  // Verify that chunks exist (document has been processed)
  const chunksExist = await hasChunksForDocument(documentId);
  if (!chunksExist) {
    return { error: 'Document has not been processed yet. Please wait for processing to complete.' };
  }

  // Check if user can regenerate quizzes (paid plans only)
  const plan = getPlanConfig(user);
  
  // Check for existing quiz with status 'generating' (race condition protection)
  const generatingQuiz = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.documentId, documentId),
        eq(quizzes.userId, fullUser.id),
        eq(quizzes.status, 'generating')
      )
    )
    .limit(1);

  if (generatingQuiz.length > 0) {
    // Quiz is already generating, return existing quiz ID
    return { quizId: generatingQuiz[0].id };
  }

  // Check for existing failed quiz (allow retry)
  const failedQuiz = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.documentId, documentId),
        eq(quizzes.userId, fullUser.id),
        eq(quizzes.status, 'failed')
      )
    )
    .limit(1);

  // If failed quiz exists, allow retry without checking for 'ready' quiz restriction
  if (failedQuiz.length === 0) {
    // Check for existing completed quiz (only if no failed quiz exists)
    const existingQuiz = await db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.documentId, documentId),
          eq(quizzes.userId, fullUser.id),
          eq(quizzes.status, 'ready')
        )
      )
      .limit(1);

    if (existingQuiz.length > 0 && !plan.canRegenerateQuizzes) {
      return { error: 'You can only generate one quiz per document on the free plan. Upgrade to regenerate quizzes.' };
    }
  }

  // Check quiz generation limit
  const limitCheck = await checkQuizGenerationLimit(user);
  if (!limitCheck.allowed) {
    return { error: limitCheck.error || 'Quiz generation limit reached' };
  }

  // Create quiz record with status 'generating'
  const newQuiz: NewQuiz = {
    userId: user.id,
    documentId,
    title: `Quiz: ${document.filename}`,
    status: 'generating',
  };

  const [createdQuiz] = await db
    .insert(quizzes)
    .values(newQuiz)
    .returning();

  if (!createdQuiz) {
    return { error: 'Failed to create quiz record' };
  }

  // Note: incrementQuizGeneration is now called in generateQuizAsync after successful completion

  // Process quiz generation in background: generate questions
  // We do this asynchronously so the function can return quickly
  const questionCount = plan.questionsPerQuiz;
  generateQuizAsync(createdQuiz.id, documentId, questionCount).catch((error) => {
    console.error('Error generating quiz:', error);
    // Error handling is done in generateQuizAsync
  });

  return { quizId: createdQuiz.id };
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { documentId } = body;

    if (!documentId || typeof documentId !== 'number') {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const result = await startQuizGeneration(documentId);

    if ('error' in result) {
      const statusCode = result.error === 'Unauthorized' ? 401 : 
                        result.error === 'Document not found' ? 404 :
                        result.error.includes('limit') || result.error.includes('free plan') ? 403 : 400;
      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      quizId: result.quizId,
      message: 'Quiz generation started',
    });
  } catch (error) {
    console.error('Error starting quiz generation:', error);
    return NextResponse.json(
      { error: 'Failed to start quiz generation' },
      { status: 500 }
    );
  }
}

