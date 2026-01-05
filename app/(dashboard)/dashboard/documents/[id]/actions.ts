'use server';

import { db } from '@/lib/db/drizzle';
import {
  documents,
  quizzes,
  questions,
  type NewQuiz,
  type NewQuestion,
} from '@/lib/db/schema';
import { getUser, getDocumentById, getQuizForDocument, hasChunksForDocument } from '@/lib/db/queries';
import { generateQuestions } from '@/lib/generation';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkQuizGenerationLimit, incrementQuizGeneration, getPlanConfig } from '@/lib/subscriptions/usage';

export type GenerateQuizState = { error?: string; quizId?: number };

export async function generateQuiz(
  _prevState: GenerateQuizState,
  formData: FormData
): Promise<GenerateQuizState> {
  const user = await getUser();
  if (!user) {
    return { error: 'User is not authenticated' };
  }

  const documentIdStr = formData.get('documentId') as string;
  const documentId = parseInt(documentIdStr);
  
  if (isNaN(documentId)) {
    return { error: 'Invalid document ID' };
  }

  // Verify document belongs to user
  const document = await getDocumentById(documentId);
  if (!document) {
    return { error: 'Document not found' };
  }

  if (document.userId !== user.id) {
    return { error: 'Unauthorized' };
  }

  // Check if document is ready for quiz generation
  // Document must be ready (processing complete) or failed (for retry)
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
  const existingQuiz = await getQuizForDocument(documentId);
  
  if (existingQuiz && !plan.canRegenerateQuizzes) {
    return { error: 'You can only generate one quiz per document on the free plan. Upgrade to regenerate quizzes.' };
  }

  // Check quiz generation limit
  const limitCheck = await checkQuizGenerationLimit(user);
  if (!limitCheck.allowed) {
    return { error: limitCheck.error || 'Quiz generation limit reached' };
  }

  try {
    // Generate questions using LLM with plan-specific count
    // Document has already been processed (extracted, chunked, and embedded) during upload
    const questionCount = plan.questionsPerQuiz;
    const generatedQuestions = await generateQuestions(documentId, questionCount);

    // Create quiz
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
      return { error: 'Failed to create quiz' };
    }

    // Create questions
    const newQuestions: NewQuestion[] = generatedQuestions.map((q) => ({
      quizId: createdQuiz.id,
      type: 'multiple_choice',
      prompt: q.prompt,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
    }));

    await db.insert(questions).values(newQuestions);

    // Update quiz status to ready
    await db
      .update(quizzes)
      .set({ status: 'ready' })
      .where(eq(quizzes.id, createdQuiz.id));

    // Increment usage count
    await incrementQuizGeneration(user);

    // Revalidate pages
    revalidatePath('/dashboard/documents');
    revalidatePath(`/dashboard/quizzes/${createdQuiz.id}`);

    // Redirect to quiz page
    redirect(`/dashboard/quizzes/${createdQuiz.id}`);
  } catch (error) {
    // Re-throw redirect errors - Next.js uses these internally
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    
    console.error('Error generating quiz:', error);

    return { error: 'Failed to generate quiz. Please try again.' };
  }
}
