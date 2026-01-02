'use server';

import { db } from '@/lib/db/drizzle';
import {
  documents,
  quizzes,
  questions,
  extractions,
  documentChunks,
  type NewQuiz,
  type NewQuestion,
  type NewExtraction,
  type NewDocumentChunk,
} from '@/lib/db/schema';
import { getUser, getDocumentById, getExtractionForDocument, getQuizForDocument, hasChunksForExtraction } from '@/lib/db/queries';
import { extractTextFromDocument } from '@/lib/extraction';
import { generateQuestions } from '@/lib/generation';
import { chunkDocument, estimateTokenCount } from '@/lib/chunking';
import { generateEmbeddings } from '@/lib/embeddings';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkQuizGenerationLimit, incrementQuizGeneration, getPlanConfig } from '@/lib/subscriptions/usage';

export type GenerateQuizState = { error?: string; quizId?: number };

export async function generateQuiz(
  _prevState: GenerateQuizState,
  formData: FormData
): Promise<GenerateQuizState> {
  const user = await getUser();
  if (!user) {
    return { error: 'User is not authenticated' };
  }

  const documentIdStr = formData.get('documentId') as string;
  const documentId = parseInt(documentIdStr);
  
  if (isNaN(documentId)) {
    return { error: 'Invalid document ID' };
  }

  // Verify document belongs to user
  const document = await getDocumentById(documentId);
  if (!document) {
    return { error: 'Document not found' };
  }

  if (document.userId !== user.id) {
    return { error: 'Unauthorized' };
  }

  // Check if document is ready for processing
  if (document.status !== 'uploaded' && document.status !== 'ready') {
    return { error: `Document status is ${document.status}. Cannot generate quiz.` };
  }

  // Check if user can regenerate quizzes (paid plans only)
  const plan = getPlanConfig(user);
  const existingQuiz = await getQuizForDocument(documentId);
  
  if (existingQuiz && !plan.canRegenerateQuizzes) {
    return { error: 'You can only generate one quiz per document on the free plan. Upgrade to regenerate quizzes.' };
  }

  // Check quiz generation limit
  const limitCheck = await checkQuizGenerationLimit(user);
  if (!limitCheck.allowed) {
    return { error: limitCheck.error || 'Quiz generation limit reached' };
  }

  try {
    // Update document status to processing
    await db
      .update(documents)
      .set({ status: 'processing' })
      .where(eq(documents.id, documentId));

    // Extract text (or get existing extraction)
    let extraction = await getExtractionForDocument(documentId);
    let extractedText: string;

    if (extraction) {
      extractedText = extraction.rawText;
    } else {
      // Extract text from document
      extractedText = await extractTextFromDocument(
        documentId,
        document.storageKey,
        document.mimeType
      );

      // Save extraction
      const extractionMethod = (() => {
        switch (document.mimeType) {
          case 'application/pdf':
            return 'node-pdf';
          case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
            return 'node-pptx';
          case 'application/msword':
          case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'node-word';
          default:
            return 'unknown';
        }
      })();

      const newExtraction: NewExtraction = {
        documentId,
        rawText: extractedText,
        method: extractionMethod,
      };

      [extraction] = await db
        .insert(extractions)
        .values(newExtraction)
        .returning();
    }

    // Process chunks: chunk the text, generate embeddings, and store
    // Check if chunks already exist for this extraction
    const chunksExist = extraction ? await hasChunksForExtraction(extraction.id) : false;
    
    if (!chunksExist && extraction) {
      console.log('[chunking] Starting chunk processing for extraction', extraction.id);
      console.log('[chunking] Extracted text length:', extractedText.length);
      
      // Chunk the document
      const chunks = chunkDocument(extractedText);
      console.log('[chunking] Created', chunks.length, 'chunks');

      if (chunks.length === 0) {
        console.warn('[chunking] No chunks created - text may be too short or empty');
        // For very short documents, create a single chunk even if it's small
        if (extractedText.trim().length > 0) {
          const singleChunk = [{
            text: extractedText.trim(),
            index: 0,
            startChar: 0,
            endChar: extractedText.trim().length,
          }];
          console.log('[chunking] Creating single chunk for short document');
          
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
          console.log('[chunking] Stored single chunk in database');
        } else {
          throw new Error('Extracted text is empty. Cannot create chunks.');
        }
      } else if (chunks.length > 0) {
        // Generate embeddings for all chunks
        const chunkTexts = chunks.map((chunk) => chunk.text);
        console.log('[embeddings] Generating embeddings for', chunkTexts.length, 'chunks');
        const embeddings = await generateEmbeddings(chunkTexts);
        console.log('[embeddings] Generated', embeddings.length, 'embeddings');

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
        console.log('[chunking] Stored', newChunks.length, 'chunks in database');
      }
    }

    // Generate questions using LLM with plan-specific count
    // Now using RAG - generateQuestions will retrieve chunks instead of using raw text
    const questionCount = plan.questionsPerQuiz;
    const generatedQuestions = await generateQuestions(documentId, questionCount);

    // Create quiz
    const newQuiz: NewQuiz = {
      userId: user.id,
      documentId,
      title: `Quiz: ${document.filename}`,
      status: 'generating',
    };

    const [createdQuiz] = await db
      .insert(quizzes)
      .values(newQuiz)
      .returning();

    if (!createdQuiz) {
      await db
        .update(documents)
        .set({ status: 'failed' })
        .where(eq(documents.id, documentId));
      return { error: 'Failed to create quiz' };
    }

    // Create questions
    const newQuestions: NewQuestion[] = generatedQuestions.map((q) => ({
      quizId: createdQuiz.id,
      type: 'multiple_choice',
      prompt: q.prompt,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
    }));

    await db.insert(questions).values(newQuestions);

    // Update quiz status to ready
    await db
      .update(quizzes)
      .set({ status: 'ready' })
      .where(eq(quizzes.id, createdQuiz.id));

    // Update document status to ready
    await db
      .update(documents)
      .set({ status: 'ready' })
      .where(eq(documents.id, documentId));

    // Increment usage count
    await incrementQuizGeneration(user);

    // Revalidate pages
    revalidatePath('/dashboard/documents');
    revalidatePath(`/dashboard/quizzes/${createdQuiz.id}`);

    // Redirect to quiz page
    redirect(`/dashboard/quizzes/${createdQuiz.id}`);
  } catch (error) {
    // Re-throw redirect errors - Next.js uses these internally
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    
    console.error('Error generating quiz:', error);

    // Update document status to failed
    await db
      .update(documents)
      .set({ status: 'failed' })
      .where(eq(documents.id, documentId));

    return { error: 'Failed to generate quiz. Please try again.' };
  }
}
