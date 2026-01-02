/**
 * Vector similarity search using pgvector
 */

import { sql } from 'drizzle-orm';
import { db, client } from './db/drizzle';
import { documentChunks } from './db/schema';
import { eq } from 'drizzle-orm';
import type { DocumentChunk } from './db/schema';
import { generateEmbedding } from './embeddings';

/**
 * Find top-k chunks similar to a query embedding using cosine similarity
 * @param documentId Document ID to search within
 * @param queryEmbedding Query embedding vector
 * @param limit Maximum number of chunks to return
 * @returns Array of chunks sorted by similarity (most similar first)
 */
export async function findSimilarChunks(
  documentId: number,
  queryEmbedding: number[],
  limit: number = 10
): Promise<DocumentChunk[]> {
  // Convert embedding array to pgvector format: [1,2,3]
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Use raw SQL for pgvector similarity search
  // The <=> operator is cosine distance (lower is more similar)
  // Using postgres client directly for raw SQL with pgvector
  const results = await client.unsafe(
    `SELECT 
      id, document_id, extraction_id, chunk_index, text, embedding, token_count, created_at
    FROM document_chunks
    WHERE document_id = $1
    ORDER BY embedding <=> $2::vector
    LIMIT $3`,
    [documentId, embeddingStr, limit]
  );

  // Map results to DocumentChunk type
  return results.map((row: any) => ({
    id: row.id,
    documentId: row.document_id,
    extractionId: row.extraction_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    embedding: typeof row.embedding === 'string' 
      ? row.embedding.replace(/[\[\]]/g, '').split(',').map(Number)
      : row.embedding,
    tokenCount: row.token_count,
    createdAt: row.created_at,
  })) as DocumentChunk[];
}

/**
 * Find chunks from different sections of the document (distributed sampling)
 * This ensures questions cover the entire document, not just one section
 * @param documentId Document ID
 * @param limit Total number of chunks to return
 * @returns Array of chunks distributed across the document
 */
export async function findDiverseChunks(
  documentId: number,
  limit: number = 20
): Promise<DocumentChunk[]> {
  // Get all chunks ordered by index
  const allChunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);

  if (allChunks.length === 0) {
    return [];
  }

  if (allChunks.length <= limit) {
    return allChunks;
  }

  // Distribute chunks across the document
  const step = allChunks.length / limit;
  const selectedChunks: DocumentChunk[] = [];

  for (let i = 0; i < limit; i++) {
    const index = Math.floor(i * step);
    selectedChunks.push(allChunks[index]);
  }

  return selectedChunks;
}

/**
 * Find chunks optimized for question generation
 * Uses a hybrid approach: combines similarity search with diversity
 * @param documentId Document ID
 * @param questionCount Number of questions to generate (affects chunk selection)
 * @returns Array of chunks to use for question generation
 */
export async function findChunksForQuestionGeneration(
  documentId: number,
  questionCount: number = 8
): Promise<DocumentChunk[]> {
  // Strategy: Generate a general query embedding and find diverse similar chunks
  // For quiz generation, we want to cover the entire document, so we'll use
  // a combination of similarity and diversity

  // Generate a general query embedding for "educational content"
  // This helps find chunks that are likely to contain key concepts
  const generalQuery = 'educational content key concepts important information';
  const queryEmbedding = await generateEmbedding(generalQuery);

  // Get top chunks by similarity (but not all from the same area)
  const similarChunks = await findSimilarChunks(
    documentId,
    queryEmbedding,
    Math.ceil(questionCount * 2) // Get more chunks than needed
  );

  // Also get diverse chunks to ensure coverage
  const diverseChunks = await findDiverseChunks(
    documentId,
    Math.ceil(questionCount * 1.5)
  );

  // Combine and deduplicate by chunk ID
  const chunkMap = new Map<number, DocumentChunk>();
  
  // Add diverse chunks first (to ensure coverage)
  for (const chunk of diverseChunks) {
    chunkMap.set(chunk.id, chunk);
  }

  // Add similar chunks (may overwrite some diverse chunks, which is fine)
  for (const chunk of similarChunks) {
    chunkMap.set(chunk.id, chunk);
  }

  // Convert to array and sort by chunk index to maintain document order
  const combinedChunks = Array.from(chunkMap.values()).sort(
    (a, b) => a.chunkIndex - b.chunkIndex
  );

  // Return enough chunks to generate the requested number of questions
  // Estimate: ~2-3 chunks per question to have enough context
  const targetChunks = Math.min(
    combinedChunks.length,
    questionCount * 3
  );

  return combinedChunks.slice(0, targetChunks);
}

/**
 * Find chunks by custom query text
 * @param documentId Document ID
 * @param queryText Query text to search for
 * @param limit Maximum number of chunks to return
 * @returns Array of chunks similar to the query
 */
export async function findChunksByQuery(
  documentId: number,
  queryText: string,
  limit: number = 10
): Promise<DocumentChunk[]> {
  const queryEmbedding = await generateEmbedding(queryText);
  return findSimilarChunks(documentId, queryEmbedding, limit);
}

