import { NextResponse } from 'next/server';
import { getQuizzesForUser } from '@/lib/db/queries';

export async function GET() {
  try {
    const quizzes = await getQuizzesForUser();
    return NextResponse.json(quizzes);
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quizzes' },
      { status: 500 }
    );
  }
}


