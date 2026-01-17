'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
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

interface QuizAttempt {
  id: number;
  quizId: number;
  userId: number;
  answers: Record<number, number>;
  score: number;
  completedAt: string;
  createdAt: string;
}

function ViewAttempt() {
  const params = useParams();
  const quizId = params.id as string;
  const attemptId = params.attemptId as string;
  
  const { data: quiz, isLoading: quizLoading } = useSWR<Quiz>(
    `/api/quizzes/${quizId}`,
    fetcher
  );
  
  const { data: attempt, isLoading: attemptLoading } = useSWR<QuizAttempt>(
    `/api/quizzes/${quizId}/attempts/${attemptId}`,
    fetcher
  );

  if (quizLoading || attemptLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        </CardContent>
      </Card>
    );
  }

  if (!quiz || !attempt) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">
            {!quiz ? 'Quiz not found' : 'Quiz attempt not found'}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/dashboard/quizzes/${quizId}`}>
              Back to Quiz
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Calculate correct answers count
  const totalQuestions = quiz.questions.length;
  let correctAnswers = 0;

  quiz.questions.forEach((question) => {
    const userAnswer = attempt.answers[question.id];
    if (userAnswer !== undefined && question.answer !== null) {
      if (userAnswer === question.answer) {
        correctAnswers++;
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/quizzes/${quizId}`}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Quiz
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
              {quiz.title}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Attempt completed on {new Date(attempt.completedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Quiz Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-8">
            <div className="text-6xl font-bold text-orange-500 mb-2">
              {attempt.score}%
            </div>
            <p className="text-gray-600">
              You got {correctAnswers} out of {totalQuestions} questions correct
            </p>
          </div>

          <div className="space-y-4">
            {quiz.questions.map((question, index) => {
              const userAnswer = attempt.answers[question.id];
              const isCorrect =
                userAnswer !== undefined &&
                question.answer !== null &&
                userAnswer === question.answer;

              return (
                <Card
                  key={question.id}
                  className={isCorrect ? 'border-green-200' : 'border-red-200'}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Question {index + 1}
                      </CardTitle>
                      {isCorrect ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-gray-900 font-medium">{question.prompt}</p>

                    {question.choices && question.choices.length > 0 && (
                      <div className="space-y-2">
                        {question.choices.map((choice, choiceIndex) => {
                          const isUserAnswer = userAnswer === choiceIndex;
                          const isCorrectAnswer = question.answer === choiceIndex;

                          return (
                            <div
                              key={choiceIndex}
                              className={`p-3 rounded border ${
                                isCorrectAnswer
                                  ? 'bg-green-50 border-green-200'
                                  : isUserAnswer && !isCorrectAnswer
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-start">
                                <span className="font-medium mr-2">
                                  {String.fromCharCode(65 + choiceIndex)}.
                                </span>
                                <span>{choice}</span>
                                {isCorrectAnswer && (
                                  <span className="ml-auto text-green-600 font-medium">
                                    ✓ Correct
                                  </span>
                                )}
                                {isUserAnswer && !isCorrectAnswer && (
                                  <span className="ml-auto text-red-600 font-medium">
                                    ✗ Your answer
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {question.explanation && (
                      <div className="p-3 bg-blue-50 rounded border border-blue-200">
                        <p className="text-sm font-medium text-blue-900 mb-1">
                          Explanation:
                        </p>
                        <p className="text-sm text-blue-800">
                          {question.explanation}
                        </p>
                      </div>
                    )}

                    {question.sourceRef && question.sourceRef.text && (
                      <div className="text-xs text-gray-500">
                        <div className="mt-2 p-2 bg-gray-50 rounded">
                          <p className="font-medium mb-1">Source:</p>
                          <p className="text-xs">{question.sourceRef.text}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex justify-center pt-4">
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              asChild
            >
              <Link href={`/dashboard/quizzes/${quizId}`}>
                Back to Quiz
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ViewAttemptPage() {
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
        <ViewAttempt />
      </Suspense>
    </section>
  );
}
