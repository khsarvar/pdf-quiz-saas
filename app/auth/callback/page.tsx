'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

type CallbackState = {
  error: string | null;
  loading: boolean;
};

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>({
    error: null,
    loading: true
  });

  useEffect(() => {
    let isMounted = true;

    const completeLogin = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hash.get('access_token');
      const search = new URLSearchParams(window.location.search);
      const providerError = search.get('error_description') || search.get('error');

      if (providerError) {
        if (isMounted) {
          setState({ loading: false, error: providerError });
        }
        return;
      }

      if (!accessToken) {
        if (isMounted) {
          setState({
            loading: false,
            error: 'No access token was returned by the identity provider.'
          });
        }
        return;
      }

      const redirect = search.get('redirect') || '';
      const priceId = search.get('priceId') || '';
      const provider = search.get('provider') || '';

      const response = await fetch('/api/auth/oauth/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken,
          redirect,
          priceId,
          provider
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const error =
          data?.error || 'Unable to complete social sign-in. Please try again.';
        if (isMounted) {
          setState({ loading: false, error });
        }
        return;
      }

      const data = (await response.json()) as { redirectTo?: string };
      window.location.assign(data.redirectTo || '/dashboard');
    };

    void completeLogin();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {state.loading ? (
          <div className="text-center text-gray-700">
            <Loader2 className="animate-spin mx-auto h-6 w-6 mb-4 text-orange-500" />
            Finalizing your sign-in...
          </div>
        ) : (
          <div className="text-center">
            <p className="text-red-500 text-sm">{state.error}</p>
            <Link
              href="/sign-in"
              className="inline-block mt-6 py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
