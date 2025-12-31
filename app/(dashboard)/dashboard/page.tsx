'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { customerPortalAction } from '@/lib/payments/actions';
import Link from 'next/link';
import { Suspense } from 'react';
import useSWR from 'swr';

type UserSubscription = {
  planName: string | null;
  subscriptionStatus: string | null;
  subscriptionPeriodStart: string | null;
  subscriptionPeriodEnd: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SubscriptionSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ManageSubscription() {
  const { data: subscriptionData } = useSWR<UserSubscription>(
    '/api/user/subscription',
    fetcher
  );
  const planName = subscriptionData?.planName || 'free';
  const status = subscriptionData?.subscriptionStatus;
  const periodEnd = subscriptionData?.subscriptionPeriodEnd;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="mb-4 sm:mb-0">
              <p className="font-medium capitalize">Current Plan: {planName}</p>
              <p className="text-sm text-muted-foreground">
                {status === 'active'
                  ? periodEnd
                    ? `Billed monthly • Renews ${new Date(periodEnd).toLocaleDateString()}`
                    : 'Billed monthly'
                  : status === 'trialing'
                    ? 'Trial period'
                    : planName === 'free'
                      ? 'Free plan • Upgrade to unlock more features'
                      : 'No active subscription'}
              </p>
            </div>
            <div className="flex gap-2">
              {status === 'active' || status === 'trialing' ? (
                <form action={customerPortalAction}>
                  <Button type="submit" variant="outline">
                    Manage Subscription
                  </Button>
                </form>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Link href="/pricing">Upgrade Plan</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Account</h1>
      <Suspense fallback={<SubscriptionSkeleton />}>
        <ManageSubscription />
      </Suspense>
    </section>
  );
}
