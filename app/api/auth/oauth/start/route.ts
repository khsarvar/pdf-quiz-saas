import { NextRequest, NextResponse } from 'next/server';

const providerMap = {
  google: 'google',
  microsoft: 'azure'
} as const;

function getRedirectIntent(value: string | null) {
  return value === 'checkout' ? value : null;
}

function getPriceId(value: string | null) {
  if (!value) return null;
  return /^price_[A-Za-z0-9]+$/.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.redirect(new URL('/sign-in?error=oauth_config', request.url));
  }

  const providerInput = request.nextUrl.searchParams.get('provider')?.toLowerCase();
  if (!providerInput || !(providerInput in providerMap)) {
    return NextResponse.redirect(new URL('/sign-in?error=oauth_provider', request.url));
  }

  const provider = providerMap[providerInput as keyof typeof providerMap];
  const redirectIntent = getRedirectIntent(
    request.nextUrl.searchParams.get('redirect')
  );
  const priceId = getPriceId(request.nextUrl.searchParams.get('priceId'));

  const callbackUrl = new URL('/auth/callback', request.url);
  if (redirectIntent) {
    callbackUrl.searchParams.set('redirect', redirectIntent);
  }
  if (priceId) {
    callbackUrl.searchParams.set('priceId', priceId);
  }

  const authorizeUrl = new URL('/auth/v1/authorize', supabaseUrl);
  authorizeUrl.searchParams.set('provider', provider);
  authorizeUrl.searchParams.set('redirect_to', callbackUrl.toString());
  if (providerInput === 'microsoft') {
    authorizeUrl.searchParams.set('scopes', 'email');
  }

  return NextResponse.redirect(authorizeUrl);
}
