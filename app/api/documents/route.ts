import { NextResponse } from 'next/server';
import { getDocumentsForUser } from '@/lib/db/queries';

export async function GET() {
  try {
    const documents = await getDocumentsForUser();
    return NextResponse.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

