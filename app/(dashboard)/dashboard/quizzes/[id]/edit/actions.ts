'use server';

import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { questions } from '@/lib/db/schema';
import { getUser, getQuizById } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const updateQuestionSchema = z.object({
  questionId: z.string().transform(Number),
  prompt: z.string().min(1),
  choices: z.string().transform((val) => {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }),
  answer: z.string().transform(Number),
  explanation: z.string().optional(),
});

export async function updateQuestion(
  prevState: { error?: string },
  formData: FormData
) {
  const user = await getUser();
  if (!user) {
    return { error: 'User is not authenticated' };
  }

  const quizIdStr = formData.get('quizId') as string;
  const quizId = parseInt(quizIdStr);

  // Verify quiz belongs to user
  const quiz = await getQuizById(quizId);
  if (!quiz || quiz.userId !== user.id) {
    return { error: 'Unauthorized' };
  }

  const result = updateQuestionSchema.safeParse({
    questionId: formData.get('questionId'),
    prompt: formData.get('prompt'),
    choices: formData.get('choices'),
    answer: formData.get('answer'),
    explanation: formData.get('explanation') || '',
  });

  if (!result.success) {
    return { error: 'Invalid form data' };
  }

  const { questionId, prompt, choices, answer, explanation } = result.data;

  try {
    // Verify question belongs to quiz
    const [question] = await db
      .select()
      .from(questions)
      .where(
        and(eq(questions.id, questionId), eq(questions.quizId, quizId))
      )
      .limit(1);

    if (!question) {
      return { error: 'Question not found' };
    }

    // Update question
    await db
      .update(questions)
      .set({
        prompt,
        choices,
        answer,
        explanation: explanation || null,
      })
      .where(eq(questions.id, questionId));

    revalidatePath(`/dashboard/quizzes/${quizId}`);
    revalidatePath(`/dashboard/quizzes/${quizId}/edit`);

    return { success: true };
  } catch (error) {
    console.error('Error updating question:', error);
    return { error: 'Failed to update question' };
  }
}

export async function deleteQuestion(
  prevState: { error?: string },
  formData: FormData
) {
  const user = await getUser();
  if (!user) {
    return { error: 'User is not authenticated' };
  }

  const quizIdStr = formData.get('quizId') as string;
  const questionIdStr = formData.get('questionId') as string;
  const quizId = parseInt(quizIdStr);
  const questionId = parseInt(questionIdStr);

  // Verify quiz belongs to user
  const quiz = await getQuizById(quizId);
  if (!quiz || quiz.userId !== user.id) {
    return { error: 'Unauthorized' };
  }

  try {
    await db
      .delete(questions)
      .where(
        and(eq(questions.id, questionId), eq(questions.quizId, quizId))
      );

    revalidatePath(`/dashboard/quizzes/${quizId}`);
    revalidatePath(`/dashboard/quizzes/${quizId}/edit`);

    return { success: true };
  } catch (error) {
    console.error('Error deleting question:', error);
    return { error: 'Failed to delete question' };
  }
}

