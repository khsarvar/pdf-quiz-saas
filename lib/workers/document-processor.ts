/**
 * Document Processing Worker
 * Processes documents from SQS queue: extracts text, chunks, generates embeddings
 */

import { db } from '@/lib/db/drizzle';
import { documents, extractions, documentChunks, type NewExtraction, type NewDocumentChunk } from '@/lib/db/schema';
import { extractTextFromDocument } from '@/lib/extraction';
import { chunkDocument, estimateTokenCount } from '@/lib/chunking';
import { generateEmbeddings } from '@/lib/embeddings';
import { generateSummary } from '@/lib/generation';
import { eq } from 'drizzle-orm';
import {
  receiveMessages,
  deleteMessage,
  parseMessage,
  enqueueQuizGeneration,
  QUEUES,
  type DocumentProcessingMessage,
} from '@/lib/sqs/client';

/**
 * Process a single document
 */
export async function processDocument(message: DocumentProcessingMessage): Promise<void> {
  const { documentId, storageKey, mimeType, userId } = message;

  try {
    console.log('[document-processor] Starting document processing', { documentId });

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

    console.log('[document-processor] Extracted text', {
      documentId,
      textLength: extractedText.length,
      method: extractionMethod
    });

    // Generate summary
    let summary: any = null;
    try {
      console.log('[document-processor] Generating summary', { documentId, textLength: extractedText.length });
      if (extractedText && extractedText.trim().length > 0) {
        summary = await generateSummary(extractedText);
        console.log('[document-processor] Generated summary', { documentId, sectionCount: summary.length });
      }
    } catch (error) {
      console.error('[document-processor] Failed to generate summary:', error);
      // Don't throw - document processing can continue without summary
    }

    // Chunk the document
    console.log('[document-processor] Starting chunking', { documentId });
    const chunks = chunkDocument(extractedText);
    console.log('[document-processor] Created chunks', { documentId, chunkCount: chunks.length });

    if (chunks.length === 0) {
      // For very short documents, create a single chunk
      if (extractedText.trim().length > 0) {
        const singleChunk = [{
          text: extractedText.trim(),
          index: 0,
          startChar: 0,
          endChar: extractedText.trim().length,
        }];
        console.log('[document-processor] Creating single chunk for short document');

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
      } else {
        throw new Error('Extracted text is empty. Cannot create chunks.');
      }
    } else {
      // Generate embeddings for all chunks
      const chunkTexts = chunks.map((chunk) => chunk.text);
      console.log('[document-processor] Generating embeddings', { documentId, chunkCount: chunkTexts.length });
      const embeddings = await generateEmbeddings(chunkTexts);
      console.log('[document-processor] Generated embeddings', { documentId, embeddingCount: embeddings.length });

      // Store chunks in database
      const newChunks: NewDocumentChunk[] = chunks.map((chunk, index) => ({
        documentId,
        extractionId: extraction.id,
        chunkIndex: chunk.index,
        text: chunk.text,
        embedding: embeddings[index] as any,
        tokenCount: estimateTokenCount(chunk.text),
      }));

      await db.insert(documentChunks).values(newChunks);
      console.log('[document-processor] Stored chunks in database', { documentId, chunkCount: newChunks.length });
    }

    // Update document status to ready
    await db
      .update(documents)
      .set({
        status: 'ready',
        summary: summary ? summary : null
      })
      .where(eq(documents.id, documentId));

    console.log('[document-processor] Document processing complete', { documentId });

    // Auto-trigger quiz generation
    try {
      // Get plan config for the user to determine question count
      const { users, quizzes } = await import('@/lib/db/schema');
      const { getPlanConfig, checkQuizGenerationLimit } = await import('@/lib/subscriptions/usage');

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user) {
        const limitCheck = await checkQuizGenerationLimit(user);
        if (limitCheck.allowed) {
          const plan = getPlanConfig(user);

          // Create quiz record
          const [document] = await db
            .select()
            .from(documents)
            .where(eq(documents.id, documentId))
            .limit(1);

          if (document) {
            const [createdQuiz] = await db
              .insert(quizzes)
              .values({
                userId: user.id,
                documentId,
                title: `Quiz: ${document.filename}`,
                status: 'generating',
              })
              .returning();

            if (createdQuiz) {
              // Enqueue quiz generation
              await enqueueQuizGeneration(createdQuiz.id, documentId, plan.questionsPerQuiz);
              console.log('[document-processor] Enqueued quiz generation', { quizId: createdQuiz.id });
            }
          }
        }
      }
    } catch (error) {
      console.error('[document-processor] Error triggering quiz generation:', error);
      // Don't throw - document is ready even if quiz generation fails
    }
  } catch (error) {
    console.error('[document-processor] Error processing document:', error);
    // Update document status to failed
    await db
      .update(documents)
      .set({ status: 'failed' })
      .where(eq(documents.id, documentId));
    throw error;
  }
}

/**
 * Poll and process messages from the document processing queue
 */
export async function pollDocumentQueue(): Promise<void> {
  console.log('[document-processor] Polling for messages...');

  const messages = await receiveMessages(QUEUES.DOCUMENT_PROCESSING, 1, 20);

  for (const message of messages) {
    if (!message.Body || !message.ReceiptHandle) {
      continue;
    }

    const parsed = parseMessage(message.Body);
    if (!parsed || parsed.type !== 'document-processing') {
      console.warn('[document-processor] Received invalid message:', message.Body);
      continue;
    }

    try {
      await processDocument(parsed);
      // Delete message on success
      await deleteMessage(QUEUES.DOCUMENT_PROCESSING, message.ReceiptHandle);
      console.log('[document-processor] Message processed and deleted');
    } catch (error) {
      console.error('[document-processor] Failed to process message:', error);
      // Message will become visible again after visibility timeout
      // and will be moved to DLQ after max retries
    }
  }
}

/**
 * Start the document processor worker loop
 */
export async function startDocumentProcessor(): Promise<void> {
  console.log('[document-processor] Starting document processor worker');

  while (true) {
    try {
      await pollDocumentQueue();
    } catch (error) {
      console.error('[document-processor] Error in poll loop:', error);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
