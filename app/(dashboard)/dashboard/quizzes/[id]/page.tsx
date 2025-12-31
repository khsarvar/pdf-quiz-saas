'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Play } from 'lucide-react';
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
  questions: Question[];
}

function QuizDetail() {
  const params = useParams();
  const quizId = params.id as string;
  const { data: quiz, isLoading } = useSWR<Quiz>(
    `/api/quizzes/${quizId}`,
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
            <Link href="/dashboard/documents">Back to Documents</Link>
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
            <Link href="/dashboard/documents">Back to Documents</Link>
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
            href="/dashboard/documents"
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Documents
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

      <div className="space-y-4">
        {quiz.questions.map((question, index) => (
          <Card key={question.id}>
            <CardHeader>
              <CardTitle className="text-base">
                Question {index + 1} of {quiz.questions.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-900 font-medium">{question.prompt}</p>

              {question.choices && question.choices.length > 0 && (
                <div className="space-y-2">
                  {question.choices.map((choice, choiceIndex) => {
                    const isCorrect = question.answer !== null && choiceIndex === question.answer;
                    return (
                      <div
                        key={choiceIndex}
                        className={`p-3 rounded border ${
                          isCorrect
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start">
                          <span className="font-medium mr-2">
                            {String.fromCharCode(65 + choiceIndex)}.
                          </span>
                          <span>{choice}</span>
                          {isCorrect && (
                            <span className="ml-auto text-green-600 font-medium">
                              ✓ Correct
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {question.explanation && (
                <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-sm font-medium text-blue-900 mb-1">
                    Explanation:
                  </p>
                  <p className="text-sm text-blue-800">{question.explanation}</p>
                </div>
              )}

              {question.sourceRef && (
                <div className="mt-2 space-y-2">
                  {question.sourceRef.text && (
                    <div className="p-2 bg-gray-50 rounded border border-gray-200">
                      <p className="text-xs font-medium text-gray-700 mb-1">
                        Source Snippet:
                      </p>
                      <p className="text-xs text-gray-600 italic">
                        "{question.sourceRef.text}"
                      </p>
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    {question.sourceRef.page && (
                      <span>Page {question.sourceRef.page}</span>
                    )}
                    {question.sourceRef.slide && (
                      <span>Slide {question.sourceRef.slide}</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
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

