'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileText, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Suspense } from 'react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface SummarySection {
  title: string;
  points: string[];
}

interface Document {
  id: number;
  filename: string;
  status: string;
  pageCount: number | null;
  createdAt: string;
  summary: SummarySection[] | string[] | null; // Support both old (string[]) and new (SummarySection[]) formats
  quizId: number | null;
  quizStatus: string | null;
}

// Helper function to parse markdown bold syntax and render it
function parseBoldText(text: string) {
  const parts: (string | JSX.Element)[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add bold text
    parts.push(
      <strong key={key++} className="font-semibold text-gray-900">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// Check if summary is in new format (sections) or old format (flat array)
function isSectionFormat(summary: any): summary is SummarySection[] {
  return (
    Array.isArray(summary) &&
    summary.length > 0 &&
    typeof summary[0] === 'object' &&
    'title' in summary[0] &&
    'points' in summary[0]
  );
}

function DocumentDetail() {
  const params = useParams();
  const documentId = params.id as string;
  const { data: document, isLoading, mutate } = useSWR<Document>(
    `/api/documents/${documentId}`,
    fetcher,
    {
      refreshInterval: (data) => {
        // Poll every 2 seconds if document is processing or quiz is generating
        if (!data) return 0;
        if (data.status === 'processing' || data.quizStatus === 'generating') {
          return 2000;
        }
        return 0; // Stop polling when ready
      },
    }
  );

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!document) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">Document not found</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/documents">Back to Documents</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isProcessing = document.status === 'processing';
  const hasSummary = document.summary && Array.isArray(document.summary) && document.summary.length > 0;
  const isNewFormat = hasSummary && isSectionFormat(document.summary);
  const quizReady = document.quizStatus === 'ready' && document.quizId;
  const quizGenerating = document.quizStatus === 'generating' || (!document.quizStatus && document.status === 'ready');

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
            {document.filename}
          </h1>
          <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600">
            <span>
              Uploaded {new Date(document.createdAt).toLocaleDateString()}
            </span>
            {document.pageCount && (
              <span>{document.pageCount} page{document.pageCount !== 1 ? 's' : ''}</span>
            )}
            <span className="capitalize">{document.status}</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {quizGenerating && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating quiz...</span>
            </div>
          )}
          {quizReady && (
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" asChild>
              <Link href={`/dashboard/quizzes/${document.quizId}`}>
                <Play className="mr-2 h-4 w-4" />
                View Quiz
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <div className="flex items-center space-x-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing document and generating summary...</span>
            </div>
          ) : hasSummary && isNewFormat ? (
            <div className="space-y-6">
              {(document.summary as SummarySection[]).map((section, sectionIndex) => (
                <div 
                  key={sectionIndex} 
                  className="border-l-4 border-orange-500 pl-5 py-2 bg-orange-50/30 rounded-r-md"
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-3.5 tracking-tight">
                    {section.title}
                  </h3>
                  <ul className="space-y-3">
                    {section.points.map((point, pointIndex) => (
                      <li key={pointIndex} className="flex items-start group">
                        <span className="text-orange-500 mr-3 mt-1.5 font-bold text-lg leading-none">•</span>
                        <span className="text-gray-700 flex-1 leading-relaxed text-[15px]">
                          {parseBoldText(point)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : hasSummary ? (
            // Fallback for old format (flat array)
            <ul className="space-y-3">
              {(document.summary as string[]).map((point, index) => (
                <li key={index} className="flex items-start">
                  <span className="text-orange-500 mr-3 mt-1.5 font-bold text-lg leading-none">•</span>
                  <span className="text-gray-700 flex-1 leading-relaxed text-[15px]">
                    {parseBoldText(point)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-gray-500">
              <p>Summary is not available for this document.</p>
              {document.status === 'ready' && (
                <p className="text-sm mt-2">
                  The summary may still be generating, or generation may have failed.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DocumentDetailPage() {
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
        <DocumentDetail />
      </Suspense>
    </section>
  );
}

