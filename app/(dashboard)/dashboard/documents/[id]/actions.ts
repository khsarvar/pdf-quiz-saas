'use server';

import { revalidatePath } from 'next/cache';
import { startQuizGeneration } from '@/app/api/quizzes/generate/route';

export type GenerateQuizState = { error?: string; quizId?: number };

export async function generateQuiz(
  _prevState: GenerateQuizState,
  formData: FormData
): Promise<GenerateQuizState> {
  const documentIdStr = formData.get('documentId') as string;
  const documentId = parseInt(documentIdStr);
  
  if (isNaN(documentId)) {
    return { error: 'Invalid document ID' };
  }

  try {
    // Start quiz generation (non-blocking)
    const result = await startQuizGeneration(documentId);

    if ('error' in result) {
      return { error: result.error };
    }

    // Revalidate pages to show updated quiz status
    revalidatePath('/dashboard/documents');

    return { quizId: result.quizId };
  } catch (error) {
    console.error('Error starting quiz generation:', error);
    return { error: 'Failed to start quiz generation. Please try again.' };
  }
}
