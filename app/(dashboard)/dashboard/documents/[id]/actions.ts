'use server';

import { db } from '@/lib/db/drizzle';
import {
  documents,
  quizzes,
  questions,
  extractions,
  type NewQuiz,
  type NewQuestion,
  type NewExtraction,
} from '@/lib/db/schema';
import { getUser, getDocumentById, getExtractionForDocument, getQuizForDocument } from '@/lib/db/queries';
import { extractTextFromDocument } from '@/lib/extraction';
import { generateQuestions } from '@/lib/generation';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkQuizGenerationLimit, incrementQuizGeneration, getPlanConfig } from '@/lib/subscriptions/usage';

export async function generateQuiz(
  prevStateOrFormData: { error?: string; quizId?: number } | FormData,
  formData?: FormData
) {
  const user = await getUser();
  if (!user) {
    return { error: 'User is not authenticated' };
  }

  // Handle both calling patterns:
  // 1. Direct form action: generateQuiz(formData)
  // 2. useActionState: generateQuiz(prevState, formData)
  const actualFormData = formData || (prevStateOrFormData as FormData);
  const documentIdStr = actualFormData.get('documentId') as string;
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

  // Check if document is ready for processing
  if (document.status !== 'uploaded' && document.status !== 'ready') {
    return { error: `Document status is ${document.status}. Cannot generate quiz.` };
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
    // Update document status to processing
    await db
      .update(documents)
      .set({ status: 'processing' })
      .where(eq(documents.id, documentId));

    // Extract text (or get existing extraction)
    let extraction = await getExtractionForDocument(documentId);
    let extractedText: string;

    if (extraction) {
      extractedText = extraction.rawText;
    } else {
      // Extract text from document
      extractedText = await extractTextFromDocument(
        documentId,
        document.storageKey,
        document.mimeType
      );

      // Save extraction
      const extractionMethod = (() => {
        switch (document.mimeType) {
          case 'application/pdf':
            return 'python-pdf';
          case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
            return 'python-pptx';
          case 'application/msword':
          case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'python-word';
          default:
            return 'unknown';
        }
      })();

      const newExtraction: NewExtraction = {
        documentId,
        rawText: extractedText,
        method: extractionMethod,
      };

      [extraction] = await db
        .insert(extractions)
        .values(newExtraction)
        .returning();
    }

    // Generate questions using LLM with plan-specific count
    const questionCount = plan.questionsPerQuiz;
    const generatedQuestions = await generateQuestions(extractedText, questionCount);

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
      await db
        .update(documents)
        .set({ status: 'failed' })
        .where(eq(documents.id, documentId));
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

    // Update document status to ready
    await db
      .update(documents)
      .set({ status: 'ready' })
      .where(eq(documents.id, documentId));

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

    // Update document status to failed
    await db
      .update(documents)
      .set({ status: 'failed' })
      .where(eq(documents.id, documentId));

    return { error: 'Failed to generate quiz. Please try again.' };
  }
}
