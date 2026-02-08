/**
 * Quiz Generation Worker
 * Processes quiz generation jobs from SQS queue
 */

import { db } from '@/lib/db/drizzle';
import { quizzes, questions, users, type NewQuestion } from '@/lib/db/schema';
import { generateQuestions } from '@/lib/generation';
import { incrementQuizGeneration } from '@/lib/subscriptions/usage';
import { eq } from 'drizzle-orm';
import {
  receiveMessages,
  deleteMessage,
  parseMessage,
  QUEUES,
  type QuizGenerationMessage,
} from '@/lib/sqs/client';

/**
 * Process a single quiz generation job
 */
export async function processQuizGeneration(message: QuizGenerationMessage): Promise<void> {
  const { quizId, documentId, questionCount } = message;

  try {
    console.log('[quiz-generator] Starting quiz generation', { quizId, documentId });

    // Generate questions using LLM
    const generatedQuestions = await generateQuestions(documentId, questionCount);
    console.log('[quiz-generator] Generated questions', { quizId, questionCount: generatedQuestions.length });

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
    console.log('[quiz-generator] Saved questions to database', { quizId, questionCount: newQuestions.length });

    // Update quiz status to ready
    await db
      .update(quizzes)
      .set({ status: 'ready' })
      .where(eq(quizzes.id, quizId));

    // Increment usage count only on successful completion
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

    console.log('[quiz-generator] Quiz generation complete', { quizId });
  } catch (error) {
    console.error('[quiz-generator] Error generating quiz:', error);
    // Update quiz status to failed
    await db
      .update(quizzes)
      .set({ status: 'failed' })
      .where(eq(quizzes.id, quizId));
    throw error;
  }
}

/**
 * Poll and process messages from the quiz generation queue
 */
export async function pollQuizQueue(): Promise<void> {
  console.log('[quiz-generator] Polling for messages...');

  const messages = await receiveMessages(QUEUES.QUIZ_GENERATION, 1, 20);

  for (const message of messages) {
    if (!message.Body || !message.ReceiptHandle) {
      continue;
    }

    const parsed = parseMessage(message.Body);
    if (!parsed || parsed.type !== 'quiz-generation') {
      console.warn('[quiz-generator] Received invalid message:', message.Body);
      continue;
    }

    try {
      await processQuizGeneration(parsed);
      // Delete message on success
      await deleteMessage(QUEUES.QUIZ_GENERATION, message.ReceiptHandle);
      console.log('[quiz-generator] Message processed and deleted');
    } catch (error) {
      console.error('[quiz-generator] Failed to process message:', error);
      // Message will become visible again after visibility timeout
      // and will be moved to DLQ after max retries
    }
  }
}

/**
 * Start the quiz generator worker loop
 */
export async function startQuizGenerator(): Promise<void> {
  console.log('[quiz-generator] Starting quiz generator worker');

  while (true) {
    try {
      await pollQuizQueue();
    } catch (error) {
      console.error('[quiz-generator] Error in poll loop:', error);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
