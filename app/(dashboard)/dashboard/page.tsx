'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Suspense } from 'react';
import useSWR from 'swr';
import { User } from '@/lib/db/schema';
import { Quiz } from '@/lib/db/schema';
import { Upload, Sparkles } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function WelcomeBanner() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const name = user?.name || user?.email?.split('@')[0] || 'there';

  return (
    <Card className="mb-6 bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
      <CardContent className="p-6">
        <h1 className="text-2xl lg:text-3xl font-semibold text-gray-900 mb-2">
          Welcome back, {name}!
        </h1>
        <p className="text-gray-600">
          Ready to create your next quiz? Upload slides or start a new quiz to get started.
        </p>
      </CardContent>
    </Card>
  );
}

function MetricsCard() {
  const { data: quizzes, isLoading } = useSWR<Quiz[]>('/api/quizzes', fetcher);
  
  const quizzesCreated = quizzes?.filter(q => q.status === 'ready').length || 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Quizzes Created</p>
              <p className="text-2xl font-semibold text-gray-900">{quizzesCreated}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button
            asChild
            className="bg-orange-500 hover:bg-orange-600 text-white h-auto py-4"
          >
            <Link href="/dashboard/documents/upload" className="flex flex-col items-center justify-center">
              <Upload className="h-6 w-6 mb-2" />
              <span className="font-medium">Upload Slides</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto py-4 border-2"
          >
            <Link href="/dashboard/documents" className="flex flex-col items-center justify-center">
              <Sparkles className="h-6 w-6 mb-2" />
              <span className="font-medium">Start Quiz</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <Suspense fallback={<div className="h-24 bg-gray-100 rounded-lg mb-6 animate-pulse" />}>
        <WelcomeBanner />
      </Suspense>
      <Suspense fallback={<div className="h-32 bg-gray-100 rounded-lg mb-6 animate-pulse" />}>
        <MetricsCard />
      </Suspense>
      <QuickActions />
    </section>
  );
}
