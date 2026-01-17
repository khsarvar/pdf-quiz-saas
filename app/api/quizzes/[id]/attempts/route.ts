import { NextRequest, NextResponse } from 'next/server';
import { createQuizAttempt, getQuizAttempts, getQuizById } from '@/lib/db/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quizId = parseInt(id);
    
    if (isNaN(quizId)) {
      return NextResponse.json(
        { error: 'Invalid quiz ID' },
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

    const body = await request.json();
    const { answers, score } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json(
        { error: 'Invalid answers format' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || score < 0 || score > 100) {
      return NextResponse.json(
        { error: 'Invalid score. Must be a number between 0 and 100' },
        { status: 400 }
      );
    }

    const attempt = await createQuizAttempt(quizId, quiz.userId, answers, score);

    return NextResponse.json(attempt);
  } catch (error) {
    console.error('Error creating quiz attempt:', error);
    return NextResponse.json(
      { error: 'Failed to create quiz attempt' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quizId = parseInt(id);
    
    if (isNaN(quizId)) {
      return NextResponse.json(
        { error: 'Invalid quiz ID' },
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

    const attempts = await getQuizAttempts(quizId);

    return NextResponse.json(attempts);
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz attempts' },
      { status: 500 }
    );
  }
}
