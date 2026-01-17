import { NextResponse } from 'next/server';
import { getQuizAttemptById, getQuizById } from '@/lib/db/queries';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    const { id, attemptId } = await params;
    const quizId = parseInt(id);
    const attemptIdNum = parseInt(attemptId);
    
    if (isNaN(quizId) || isNaN(attemptIdNum)) {
      return NextResponse.json(
        { error: 'Invalid quiz ID or attempt ID' },
        { status: 400 }
      );
    }

    // Verify user owns the quiz
    const quiz = await getQuizById(quizId);
    if (!quiz) {
      return NextResponse.json(
        { error: 'Quiz not found' },
        { status: 404 }
      );
    }

    const attempt = await getQuizAttemptById(attemptIdNum);
    
    if (!attempt) {
      return NextResponse.json(
        { error: 'Quiz attempt not found' },
        { status: 404 }
      );
    }

    // Verify the attempt belongs to the quiz
    if (attempt.quizId !== quizId) {
      return NextResponse.json(
        { error: 'Quiz attempt does not belong to this quiz' },
        { status: 400 }
      );
    }

    return NextResponse.json(attempt);
  } catch (error) {
    console.error('Error fetching quiz attempt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz attempt' },
      { status: 500 }
    );
  }
}
