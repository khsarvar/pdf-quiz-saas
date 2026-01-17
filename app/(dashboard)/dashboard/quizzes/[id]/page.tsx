'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Play, Eye, Clock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Suspense } from 'react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Question {
  id: number;
  prompt: string;
  choices: string[] | null;
  answer: number | null;
  explanation: string | null;
  sourceRef: {
    page?: number;
    slide?: number;
    text?: string;
  } | null;
}

interface Quiz {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  documentId: number;
  questions: Question[];
}

interface QuizAttempt {
  id: number;
  quizId: number;
  userId: number;
  answers: Record<number, number>;
  score: number;
  completedAt: string;
  createdAt: string;
}

function QuizDetail() {
  const params = useParams();
  const quizId = params.id as string;
  const { data: quiz, isLoading } = useSWR<Quiz>(
    `/api/quizzes/${quizId}`,
    fetcher
  );
  const { data: attempts, isLoading: attemptsLoading } = useSWR<QuizAttempt[]>(
    quiz?.status === 'ready' ? `/api/quizzes/${quizId}/attempts` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!quiz) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">Quiz not found</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/documents">Back to Summary</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (quiz.status !== 'ready') {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">
            Quiz is {quiz.status}. Please wait for it to be ready.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={quiz.documentId ? `/dashboard/documents/${quiz.documentId}` : "/dashboard/documents"}>
              Back to Summary
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={quiz.documentId ? `/dashboard/documents/${quiz.documentId}` : "/dashboard/documents"}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Summary
          </Link>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            {quiz.title}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {quiz.questions.length} questions • Created{' '}
            {new Date(quiz.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/quizzes/${quizId}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button className="bg-orange-500 hover:bg-orange-600 text-white" asChild>
            <Link href={`/dashboard/quizzes/${quizId}/take`}>
              <Play className="mr-2 h-4 w-4" />
              Take Quiz
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiz Attempt History</CardTitle>
        </CardHeader>
        <CardContent>
          {attemptsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
          ) : attempts && attempts.length > 0 ? (
            <div className="space-y-4">
              {attempts.map((attempt, index) => (
                <Card key={attempt.id} className="border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                            <span className="text-orange-600 font-semibold">
                              {attempt.score}%
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              Attempt {attempts.length - index}
                            </p>
                            <p className="text-sm text-gray-500 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {new Date(attempt.completedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/quizzes/${quizId}/attempts/${attempt.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No quiz attempts yet.</p>
              <p className="text-sm mt-2">Take the quiz to see your results here!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function QuizDetailPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <Suspense
        fallback={
          <Card className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            </CardContent>
          </Card>
        }
      >
        <QuizDetail />
      </Suspense>
    </section>
  );
}

