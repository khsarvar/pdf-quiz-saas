import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { documents, type NewDocument } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { checkDocumentUploadLimit, incrementDocumentUpload } from '@/lib/subscriptions/usage';
import { isR2Configured } from '@/lib/storage';

function guessMimeTypeFromFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if R2 is configured
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'R2 storage is not configured' },
        { status: 500 }
      );
    }

    // Authenticate user
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { filename, storageKey, contentType } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    if (!storageKey || typeof storageKey !== 'string') {
      return NextResponse.json(
        { error: 'Storage key is required' },
        { status: 400 }
      );
    }

    // Validate file type
    const inferredMimeType = contentType || guessMimeTypeFromFilename(filename);
    if (!inferredMimeType) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }

    // Check document upload limit
    const limitCheck = await checkDocumentUploadLimit(user);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.error || 'Document upload limit reached' },
        { status: 403 }
      );
    }

    // Create document record
    const newDocument: NewDocument = {
      userId: user.id,
      filename,
      storageKey,
      mimeType: inferredMimeType,
      status: 'uploaded',
    };

    const [createdDocument] = await db
      .insert(documents)
      .values(newDocument)
      .returning();

    if (!createdDocument) {
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      );
    }

    // Increment usage count (for paid plans)
    await incrementDocumentUpload(user);

    return NextResponse.json({
      documentId: createdDocument.id,
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    );
  }
}

