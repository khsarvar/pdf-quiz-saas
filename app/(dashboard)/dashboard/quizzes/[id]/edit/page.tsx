'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { Suspense, useEffect, useState } from 'react';
import { updateQuestion, deleteQuestion } from './actions';
import { useActionState } from 'react';

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

function QuestionEditor({
  question,
  quizId,
}: {
  question: Question;
  quizId: number;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [choices, setChoices] = useState<string[]>(
    question.choices || ['', '', '', '']
  );
  const [answer, setAnswer] = useState(question.answer ?? 0);
  const [explanation, setExplanation] = useState(question.explanation || '');
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(updateQuestion, { error: '' });
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteQuestion, { error: '' });

  useEffect(() => {
    if ('success' in updateState && updateState.success) {
      setIsEditing(false);
      mutate(`/api/quizzes/${quizId}`);
    }
  }, [quizId, updateState]);

  useEffect(() => {
    if ('success' in deleteState && deleteState.success) {
      mutate(`/api/quizzes/${quizId}`);
    }
  }, [deleteState, quizId]);

  const handleSave = (formData: FormData) => {
    formData.append('questionId', question.id.toString());
    formData.append('quizId', quizId.toString());
    formData.append('prompt', prompt);
    formData.append('choices', JSON.stringify(choices));
    formData.append('answer', answer.toString());
    formData.append('explanation', explanation);

    updateAction(formData);
  };

  const handleDelete = (formData: FormData) => {
    if (!confirm('Are you sure you want to delete this question?')) {
      return;
    }
    formData.append('questionId', question.id.toString());
    formData.append('quizId', quizId.toString());
    
    deleteAction(formData);
  };

  if (!isEditing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Question {question.id}</CardTitle>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
              <form action={handleDelete}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </form>
            </div>
          </div>
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
            <div className="p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-sm font-medium text-blue-900 mb-1">
                Explanation:
              </p>
              <p className="text-sm text-blue-800">{question.explanation}</p>
            </div>
          )}

          {question.sourceRef && (
            <div className="text-xs text-gray-500">
              {question.sourceRef.text && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <p className="font-medium mb-1">Source:</p>
                  <p className="text-xs">{question.sourceRef.text}</p>
                </div>
              )}
              {question.sourceRef.page && (
                <span>Page {question.sourceRef.page}</span>
              )}
              {question.sourceRef.slide && (
                <span>Slide {question.sourceRef.slide}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit Question {question.id}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSave} className="space-y-4">
          <div>
            <Label htmlFor={`prompt-${question.id}`}>Question</Label>
            <Input
              id={`prompt-${question.id}`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Choices</Label>
            <div className="space-y-2 mt-2">
              {choices.map((choice, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <span className="font-medium w-6">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  <Input
                    value={choice}
                    onChange={(e) => {
                      const newChoices = [...choices];
                      newChoices[index] = e.target.value;
                      setChoices(newChoices);
                    }}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAnswer(index)}
                    className={answer === index ? 'bg-green-100' : ''}
                  >
                    Correct
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor={`explanation-${question.id}`}>Explanation</Label>
            <Input
              id={`explanation-${question.id}`}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          {updateState?.error && (
            <p className="text-sm text-red-500">{updateState.error}</p>
          )}

          <div className="flex space-x-2">
            <Button
              type="submit"
              disabled={isUpdating}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isUpdating ? (
                'Saving...'
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setPrompt(question.prompt);
                setChoices(question.choices || ['', '', '', '']);
                setAnswer(question.answer ?? 0);
                setExplanation(question.explanation || '');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function QuizEdit() {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/quizzes/${quizId}`}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Quiz
          </Link>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            Edit: {quiz.title}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {quiz.questions.length} questions
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/quizzes/${quizId}`}>
            Done Editing
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((question) => (
          <QuestionEditor
            key={question.id}
            question={question}
            quizId={quiz.id}
          />
        ))}
      </div>
    </div>
  );
}

export default function QuizEditPage() {
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
        <QuizEdit />
      </Suspense>
    </section>
  );
}
