import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { getUserUsageStats } from '@/lib/subscriptions/usage';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const usageStats = await getUserUsageStats(user);
    // Convert Date objects to ISO strings for JSON serialization
    const serializedStats = {
      ...usageStats,
      periodEnd: usageStats.periodEnd ? usageStats.periodEnd.toISOString() : null,
    };
    return NextResponse.json(serializedStats);
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage stats' },
      { status: 500 }
    );
  }
}

