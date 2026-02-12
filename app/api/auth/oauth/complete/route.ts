import { and, eq, isNull } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  ActivityType,
  activityLogs,
  type NewUser,
  users
} from '@/lib/db/schema';
import { hashPassword, setSession } from '@/lib/auth/session';
import { stripe } from '@/lib/payments/stripe';

type SupabaseUser = {
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

function getRedirectIntent(value: unknown) {
  return value === 'checkout' ? value : null;
}

function getPriceId(value: unknown) {
  if (typeof value !== 'string') return null;
  return /^price_[A-Za-z0-9]+$/.test(value) ? value : null;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase OAuth is not configured.' },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const accessToken =
    body && typeof body.accessToken === 'string' ? body.accessToken : null;

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Missing OAuth access token.' },
      { status: 400 }
    );
  }

  const supabaseUserResponse = await fetch(new URL('/auth/v1/user', supabaseUrl), {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  if (!supabaseUserResponse.ok) {
    return NextResponse.json(
      { error: 'Unable to verify OAuth identity.' },
      { status: 401 }
    );
  }

  const supabaseUser = (await supabaseUserResponse.json()) as SupabaseUser;
  const email = supabaseUser.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: 'Your identity provider did not return an email address.' },
      { status: 400 }
    );
  }

  const fullName = supabaseUser.user_metadata?.full_name?.trim();
  const displayName = supabaseUser.user_metadata?.name?.trim();
  const resolvedName = fullName || displayName || null;

  const existingResult = await db
    .select({
      user: users
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  let user = existingResult[0]?.user;
  const isNewUser = !user;
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || '';

  if (!user) {
    const passwordHash = await hashPassword(crypto.randomUUID());
    const newUser: NewUser = {
      email,
      name: resolvedName,
      passwordHash,
      role: 'owner'
    };

    const [createdUser] = await db.insert(users).values(newUser).returning();
    if (!createdUser) {
      return NextResponse.json({ error: 'Failed to create user.' }, { status: 500 });
    }
    user = createdUser;
  } else if (!user.name && resolvedName) {
    const [updatedUser] = await db
      .update(users)
      .set({ name: resolvedName })
      .where(eq(users.id, user.id))
      .returning();
    if (updatedUser) {
      user = updatedUser;
    }
  }

  await Promise.all([
    setSession(user),
    db.insert(activityLogs).values({
      userId: user.id,
      action: isNewUser ? ActivityType.SIGN_UP : ActivityType.SIGN_IN,
      ipAddress
    })
  ]);

  const redirectIntent = getRedirectIntent(body?.redirect);
  const priceId = getPriceId(body?.priceId);
  if (redirectIntent === 'checkout' && priceId) {
    const baseUrl = process.env.BASE_URL || request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      customer: user.stripeCustomerId || undefined,
      client_reference_id: user.id.toString(),
      allow_promotion_codes: true
    });

    return NextResponse.json({ redirectTo: session.url || `${baseUrl}/pricing` });
  }

  return NextResponse.json({ redirectTo: '/dashboard' });
}
