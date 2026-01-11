import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { documents, extractions, documentChunks, type NewDocument, type NewExtraction, type NewDocumentChunk } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { checkQuizGenerationLimit } from '@/lib/subscriptions/usage';
import { isR2Configured } from '@/lib/storage';
import { extractTextFromDocument } from '@/lib/extraction';
import { chunkDocument, estimateTokenCount } from '@/lib/chunking';
import { generateEmbeddings } from '@/lib/embeddings';
import { generateSummary } from '@/lib/generation';
import { eq } from 'drizzle-orm';
import { startQuizGenerationForUser } from '@/app/api/quizzes/generate/route';

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

    // Check quiz generation limit (since upload now automatically generates quiz)
    const limitCheck = await checkQuizGenerationLimit(user);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.error || 'Quiz generation limit reached' },
        { status: 403 }
      );
    }

    // Create document record
    const newDocument: NewDocument = {
      userId: user.id,
      filename,
      storageKey,
      mimeType: inferredMimeType,
      status: 'processing', // Start as processing while we extract, chunk, and embed
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

    // Process document in background: extract, chunk, and generate embeddings
    // We do this asynchronously so the API can return quickly
    processDocumentAsync(createdDocument.id, storageKey, inferredMimeType, user).catch((error) => {
      console.error('Error processing document:', error);
      // Update document status to failed if processing fails
      db.update(documents)
        .set({ status: 'failed' })
        .where(eq(documents.id, createdDocument.id))
        .catch((dbError) => {
          console.error('Error updating document status:', dbError);
        });
    });

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

/**
 * Process document asynchronously: extract text, chunk, and generate embeddings
 */
async function processDocumentAsync(
  documentId: number,
  storageKey: string,
  mimeType: string,
  user: { id: number }
): Promise<void> {
  try {
    console.log('[processing] Starting document processing', { documentId });

    // Extract text from document
    const extractionResult = await extractTextFromDocument(
      documentId,
      storageKey,
      mimeType
    );

    const extractedText = extractionResult.text;
    const extractionMethod = extractionResult.method;

    // Save extraction
    const newExtraction: NewExtraction = {
      documentId,
      rawText: extractedText,
      method: extractionMethod,
    };

    const [extraction] = await db
      .insert(extractions)
      .values(newExtraction)
      .returning();

    if (!extraction) {
      throw new Error('Failed to save extraction');
    }

    console.log('[processing] Extracted text', { 
      documentId, 
      textLength: extractedText.length,
      method: extractionMethod 
    });

    // Generate summary
    let summary: any = null;
    try {
      console.log('[processing] Generating summary', { documentId, textLength: extractedText.length });
      if (!extractedText || extractedText.trim().length === 0) {
        console.warn('[processing] Extracted text is empty, skipping summary generation');
      } else {
        summary = await generateSummary(extractedText);
        console.log('[processing] Generated summary', { documentId, sectionCount: summary.length });
      }
    } catch (error) {
      console.error('[processing] Failed to generate summary:', error);
      // Log the full error for debugging
      if (error instanceof Error) {
        console.error('[processing] Summary generation error details:', error.message, error.stack);
      }
      // Don't throw - document processing can continue without summary
      // Summary can be null and user can retry later if needed
    }

    // Chunk the document
    console.log('[processing] Starting chunking', { documentId });
    const chunks = chunkDocument(extractedText);
    console.log('[processing] Created chunks', { documentId, chunkCount: chunks.length });

    if (chunks.length === 0) {
      console.warn('[processing] No chunks created - text may be too short or empty');
      // For very short documents, create a single chunk even if it's small
      if (extractedText.trim().length > 0) {
        const singleChunk = [{
          text: extractedText.trim(),
          index: 0,
          startChar: 0,
          endChar: extractedText.trim().length,
        }];
        console.log('[processing] Creating single chunk for short document');
        
        // Generate embedding for the single chunk
        const embeddings = await generateEmbeddings([singleChunk[0].text]);
        
        const newChunks: NewDocumentChunk[] = [{
          documentId,
          extractionId: extraction.id,
          chunkIndex: 0,
          text: singleChunk[0].text,
          embedding: embeddings[0] as any,
          tokenCount: estimateTokenCount(singleChunk[0].text),
        }];
        
        await db.insert(documentChunks).values(newChunks);
        console.log('[processing] Stored single chunk in database');
      } else {
        throw new Error('Extracted text is empty. Cannot create chunks.');
      }
    } else if (chunks.length > 0) {
      // Generate embeddings for all chunks
      const chunkTexts = chunks.map((chunk) => chunk.text);
      console.log('[processing] Generating embeddings', { documentId, chunkCount: chunkTexts.length });
      const embeddings = await generateEmbeddings(chunkTexts);
      console.log('[processing] Generated embeddings', { documentId, embeddingCount: embeddings.length });

      // Store chunks in database
      const newChunks: NewDocumentChunk[] = chunks.map((chunk, index) => ({
        documentId,
        extractionId: extraction.id,
        chunkIndex: chunk.index,
        text: chunk.text,
        embedding: embeddings[index] as any, // Custom type handles conversion
        tokenCount: estimateTokenCount(chunk.text),
      }));

      await db.insert(documentChunks).values(newChunks);
      console.log('[processing] Stored chunks in database', { documentId, chunkCount: newChunks.length });
    }

    // Update document status to ready and save summary
    await db
      .update(documents)
      .set({ 
        status: 'ready',
        summary: summary ? summary : null
      })
      .where(eq(documents.id, documentId));

    console.log('[processing] Document processing complete', { documentId });

    // Auto-trigger quiz generation after document is ready
    try {
      const quizResult = await startQuizGenerationForUser(documentId, user);
      if ('error' in quizResult) {
        console.error('[processing] Failed to start quiz generation:', quizResult.error);
        // Don't throw - document is ready even if quiz generation fails
        // User can retry manually later
      } else {
        console.log('[processing] Quiz generation started', { quizId: quizResult.quizId });
      }
    } catch (error) {
      console.error('[processing] Error triggering quiz generation:', error);
      // Don't throw - document is ready even if quiz generation fails
    }
  } catch (error) {
    console.error('[processing] Error processing document:', error);
    // Update document status to failed
    await db
      .update(documents)
      .set({ status: 'failed' })
      .where(eq(documents.id, documentId));
    throw error;
  }
}

