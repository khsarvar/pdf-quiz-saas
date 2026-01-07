'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, Clock, CheckCircle, XCircle, Sparkles, Loader2, Eye, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Document } from '@/lib/db/schema';
import { useRouter } from 'next/navigation';

type DocumentWithQuiz = Document & { quizId?: number | null; quizStatus?: string | null };
import { Suspense, useActionState, useEffect, useState } from 'react';
import { generateQuiz, type GenerateQuizState } from './[id]/actions';

type UsageStats = {
  plan: string;
  quizGenerations: {
    used: number;
    limit: number;
    remaining: number;
  };
  periodEnd: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function getStatusIcon(status: string) {
  switch (status) {
    case 'uploaded':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'processing':
      return <Clock className="h-4 w-4 text-blue-500" />;
    case 'ready':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function GenerateQuizButton({ documentId, quizId, quizStatus, status, onQuizCreated }: { documentId: number; quizId?: number | null; quizStatus?: string | null; status?: string; onQuizCreated?: () => void }) {
  const router = useRouter();
  const initialState: GenerateQuizState = {};
  const [state, formAction, isPending] = useActionState<GenerateQuizState, FormData>(
    generateQuiz,
    initialState
  );
  const [pollingQuizId, setPollingQuizId] = useState<number | null>(null);

  // Start polling when we get a quizId from the server action
  useEffect(() => {
    if (state?.quizId && !pollingQuizId) {
      setPollingQuizId(state.quizId);
      // Trigger refresh of documents list
      onQuizCreated?.();
    }
  }, [state?.quizId, pollingQuizId, onQuizCreated]);

  // Poll for quiz status when we have a quizId
  const { data: quizData } = useSWR<{ status: string } | null>(
    pollingQuizId ? `/api/quizzes/${pollingQuizId}` : null,
    fetcher,
    {
      refreshInterval: (data) => {
        // Poll every 2 seconds if status is 'generating', stop if 'ready' or 'failed'
        if (!data || data.status === 'generating') {
          return 2000;
        }
        return 0; // Stop polling
      },
    }
  );

  // Redirect when quiz is ready
  useEffect(() => {
    if (quizData?.status === 'ready' && pollingQuizId) {
      router.push(`/dashboard/quizzes/${pollingQuizId}`);
    }
  }, [quizData?.status, pollingQuizId, router]);

  // If quiz already exists and is ready, show "View Quiz" button
  if (quizId && !pollingQuizId && quizStatus === 'ready') {
    return (
      <Button
        asChild
        size="sm"
        className="bg-orange-500 hover:bg-orange-600 text-white"
      >
        <Link href={`/dashboard/quizzes/${quizId}`}>
          <Eye className="mr-2 h-4 w-4" />
          View Quiz
        </Link>
      </Button>
    );
  }

  // If document is ready and quiz is generating or doesn't exist yet, don't show button
  // (quiz generation happens automatically - status text is shown instead)
  if (status === 'ready' && quizStatus !== 'failed' && quizStatus !== 'ready' && !pollingQuizId) {
    return null;
  }

  // Show generating state if we're polling
  const isGenerating = pollingQuizId !== null && quizData?.status === 'generating';
  const hasFailed = quizData?.status === 'failed' || quizStatus === 'failed';
  const isRetry = hasFailed;
  const buttonText = isRetry ? 'Retry Quiz Generation' : 'Generate Quiz';

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="documentId" value={documentId} />
        <Button
          type="submit"
          size="sm"
          disabled={isPending || isGenerating}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {(isPending || isGenerating) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {buttonText}
            </>
          )}
        </Button>
      </form>
      {state?.error && (
        <p className="text-xs text-red-500 mt-1">{state.error}</p>
      )}
      {hasFailed && (
        <p className="text-xs text-red-500 mt-1">Quiz generation failed. Please try again.</p>
      )}
    </div>
  );
}

function DocumentsList() {
  const { data: documents, isLoading, mutate } = useSWR<DocumentWithQuiz[]>(
    '/api/documents',
    fetcher
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            No documents yet
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Get started by uploading your first slide deck.
          </p>
          <div className="mt-6">
            <Button asChild className="bg-orange-500 hover:bg-orange-600">
              <Link href="/dashboard/documents/upload">
                <Plus className="mr-2 h-4 w-4" />
                Generate Quiz
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc) => (
        <Card key={doc.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1">
                <FileText className="h-8 w-8 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {doc.filename}
                  </h3>
                  <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                    <span>
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                    {doc.pageCount && (
                      <span>{doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}</span>
                    )}
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(doc.status)}
                      <span>{getStatusLabel(doc.status)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {doc.status === 'processing' && (
                  <span className="text-xs text-gray-500">Processing...</span>
                )}
                {doc.status === 'ready' && doc.quizStatus === 'generating' && (
                  <span className="text-xs text-gray-500">Generating quiz...</span>
                )}
                {doc.status === 'ready' && !doc.quizStatus && (
                  <span className="text-xs text-gray-500">Generating quiz...</span>
                )}
                {/* Show button for ready quizzes (View Quiz), failed quizzes (Retry), or uploaded/failed documents */}
                {((doc.status === 'uploaded' || doc.status === 'failed') || 
                  (doc.status === 'ready' && (doc.quizStatus === 'failed' || doc.quizStatus === 'ready'))) && (
                  <GenerateQuizButton 
                    documentId={doc.id} 
                    quizId={doc.quizId} 
                    quizStatus={doc.quizStatus}
                    status={doc.status} 
                    onQuizCreated={() => mutate()} 
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsageStats() {
  const { data: usageStats, isLoading } = useSWR<UsageStats>('/api/usage', fetcher);

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  if (!usageStats) return null;

  const { quizGenerations, plan, periodEnd } = usageStats;
  const isFree = plan === 'free';
  const quizLimitReached = quizGenerations.remaining === 0;

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Usage Statistics</h3>
            <p className="text-xs text-gray-500 mt-1">
              Plan: <span className="font-semibold capitalize">{plan}</span>
              {periodEnd && (
                <> • Resets {new Date(periodEnd).toLocaleDateString()}</>
              )}
              {!periodEnd && isFree && (
                <> • Lifetime limits</>
              )}
            </p>
          </div>
          {quizLimitReached && (
            <Button asChild size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/pricing">
                Upgrade
              </Link>
            </Button>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">Quiz Generations (includes uploads)</span>
            <span className="text-xs font-medium text-gray-900">
              {quizGenerations.used} / {isFree ? quizGenerations.limit : `${quizGenerations.limit} per period`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                quizLimitReached ? 'bg-red-500' : 'bg-orange-500'
              }`}
              style={{
                width: `${Math.min(100, (quizGenerations.used / quizGenerations.limit) * 100)}%`,
              }}
            />
          </div>
          {quizLimitReached && (
            <p className="text-xs text-red-500 mt-1 flex items-center">
              <AlertCircle className="h-3 w-3 mr-1" />
              Limit reached
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DocumentsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            Documents
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your uploaded slide decks
          </p>
        </div>
        <Button
          asChild
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Link href="/dashboard/documents/upload">
            <Plus className="mr-2 h-4 w-4" />
            Generate Quiz
          </Link>
        </Button>
      </div>

      <UsageStats />

      <Suspense
        fallback={
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        }
      >
        <DocumentsList />
      </Suspense>
    </section>
  );
}
