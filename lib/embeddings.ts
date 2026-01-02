/**
 * Embedding generation using OpenAI's embedding API
 */

import OpenAI from 'openai';

let cachedOpenAI: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. Please configure it in your .env file.'
    );
  }

  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({ apiKey });
  }

  return cachedOpenAI;
}

/**
 * Get the embedding model to use (default: text-embedding-3-small)
 */
function getEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
}

/**
 * Get the embedding dimensions for the model
 */
function getEmbeddingDimensions(model: string): number {
  // text-embedding-3-small: 1536 dimensions
  // text-embedding-3-large: 3072 dimensions
  if (model.includes('3-large')) {
    return 3072;
  }
  return 1536; // default for text-embedding-3-small
}

/**
 * Generates embeddings for a batch of texts using OpenAI's embedding API
 * @param texts Array of texts to embed
 * @returns Array of embedding vectors (each is an array of numbers)
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const openai = getOpenAIClient();
  const model = getEmbeddingModel();

  // OpenAI supports up to 2048 inputs per request, but we'll batch in smaller chunks for safety
  const batchSize = 100;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const response = await openai.embeddings.create({
        model,
        input: batch,
      });

      // Extract embeddings from response
      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index) // Ensure correct order
        .map((item) => item.embedding);

      embeddings.push(...batchEmbeddings);
    } catch (error) {
      // Handle rate limiting with exponential backoff
      if (
        error instanceof OpenAI.APIError &&
        error.status === 429
      ) {
        const retryAfter = error.headers?.['retry-after'];
        const waitTime = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, Math.floor(i / batchSize)) * 1000; // Exponential backoff

        console.warn(
          `Rate limited, waiting ${waitTime}ms before retrying batch ${i / batchSize + 1}`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Retry the batch
        try {
          const response = await openai.embeddings.create({
            model,
            input: batch,
          });

          const batchEmbeddings = response.data
            .sort((a, b) => a.index - b.index)
            .map((item) => item.embedding);

          embeddings.push(...batchEmbeddings);
        } catch (retryError) {
          console.error(`Failed to generate embeddings for batch ${i / batchSize + 1}:`, retryError);
          throw new Error(
            `Failed to generate embeddings: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`
          );
        }
      } else {
        console.error(`Error generating embeddings for batch ${i / batchSize + 1}:`, error);
        throw new Error(
          `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  // Validate embedding dimensions
  const expectedDimensions = getEmbeddingDimensions(model);
  for (let i = 0; i < embeddings.length; i++) {
    if (embeddings[i].length !== expectedDimensions) {
      throw new Error(
        `Embedding ${i} has incorrect dimensions: expected ${expectedDimensions}, got ${embeddings[i].length}`
      );
    }
  }

  return embeddings;
}

/**
 * Generates a single embedding for a text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

/**
 * Get the expected embedding dimensions for the current model
 */
export function getExpectedEmbeddingDimensions(): number {
  const model = getEmbeddingModel();
  return getEmbeddingDimensions(model);
}

