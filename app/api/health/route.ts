import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const checks = {
    status: 'healthy' as 'healthy' | 'unhealthy',
    timestamp: new Date().toISOString(),
    database: 'unknown' as 'connected' | 'disconnected' | 'unknown',
    version: process.env.npm_package_version || 'unknown',
  };

  try {
    // Verify database connectivity
    await db.execute(sql`SELECT 1`);
    checks.database = 'connected';
  } catch (error) {
    checks.database = 'disconnected';
    checks.status = 'unhealthy';
    console.error('[health] Database check failed:', error);
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;

  return NextResponse.json(checks, { status: statusCode });
}
