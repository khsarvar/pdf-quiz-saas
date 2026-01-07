import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      planName: user.planName || 'free',
      subscriptionStatus: user.subscriptionStatus || null,
      subscriptionPeriodStart: user.subscriptionPeriodStart?.toISOString() || null,
      subscriptionPeriodEnd: user.subscriptionPeriodEnd?.toISOString() || null,
    });
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}


