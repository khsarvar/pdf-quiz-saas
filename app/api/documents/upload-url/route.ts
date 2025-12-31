import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { generateStorageKey, generatePresignedUploadUrl, isR2Configured } from '@/lib/storage';

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  'application/msword', // DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
];

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
    const { filename, size, contentType } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    if (!size || typeof size !== 'number') {
      return NextResponse.json(
        { error: 'File size is required' },
        { status: 400 }
      );
    }

    // Validate file size
    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be less than 50MB' },
        { status: 400 }
      );
    }

    // Validate file type
    const inferredMimeType = contentType || guessMimeTypeFromFilename(filename);
    if (!inferredMimeType || !ALLOWED_MIME_TYPES.includes(inferredMimeType)) {
      return NextResponse.json(
        { error: 'Only PDF, PPTX, DOC, and DOCX files are supported' },
        { status: 400 }
      );
    }

    // Generate storage key
    const storageKey = generateStorageKey(filename);

    // Generate presigned URL (15 minutes expiration)
    const presignedUrl = await generatePresignedUploadUrl(
      storageKey,
      inferredMimeType,
      15 * 60 // 15 minutes
    );

    return NextResponse.json({
      presignedUrl,
      storageKey,
      contentType: inferredMimeType,
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}

