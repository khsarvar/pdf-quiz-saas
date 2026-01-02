/**
 * Document chunking utilities for splitting large documents into semantic chunks
 */

export interface Chunk {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
  tokenCount?: number;
}

export interface ChunkingOptions {
  chunkSize?: number; // Target chunk size in characters (default: 4000)
  overlap?: number; // Overlap between chunks in characters (default: 800)
  minChunkSize?: number; // Minimum chunk size to avoid tiny chunks (default: 200)
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  chunkSize: 4000, // ~1000 tokens assuming ~4 chars per token
  overlap: 800, // ~200 tokens
  minChunkSize: 200,
};

/**
 * Splits text into semantic chunks with overlap.
 * Prefers splitting at paragraph boundaries, then sentences.
 */
export function chunkDocument(
  text: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  if (!text || text.trim().length === 0) {
    return chunks;
  }

  // Split by paragraphs first (double newlines)
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = '';
  let currentStart = 0;
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    if (!paragraph) continue;

    // If adding this paragraph would exceed chunk size, finalize current chunk
    if (
      currentChunk.length > 0 &&
      currentChunk.length + paragraph.length + 2 > opts.chunkSize
    ) {
      // Finalize current chunk
      const chunkText = currentChunk.trim();
      if (chunkText.length >= opts.minChunkSize) {
        chunks.push({
          text: chunkText,
          index: chunkIndex++,
          startChar: currentStart,
          endChar: currentStart + chunkText.length,
        });
      }

      // Start new chunk with overlap
      const overlapText = getOverlapText(
        currentChunk,
        opts.overlap,
        opts.chunkSize
      );
      currentChunk = overlapText + '\n\n' + paragraph;
      currentStart = currentStart + chunkText.length - overlapText.length;
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
        currentStart = getAbsolutePosition(text, i, paragraphs);
      }
    }
  }

  // Add final chunk if it exists
  // For very short documents, allow chunks smaller than minChunkSize
  const finalChunkText = currentChunk.trim();
  if (finalChunkText.length > 0) {
    // If this is the only chunk and it's smaller than minChunkSize, still include it
    // Otherwise, only include if it meets the minimum size
    if (chunks.length === 0 || finalChunkText.length >= opts.minChunkSize) {
      chunks.push({
        text: finalChunkText,
        index: chunkIndex,
        startChar: currentStart,
        endChar: currentStart + finalChunkText.length,
      });
    }
  }

  // If we have very large paragraphs that couldn't be split, split by sentences
  const finalChunks: Chunk[] = [];
  for (const chunk of chunks) {
    if (chunk.text.length <= opts.chunkSize) {
      finalChunks.push(chunk);
    } else {
      // Split large chunks by sentences
      const sentenceChunks = splitBySentences(chunk, opts);
      finalChunks.push(...sentenceChunks);
    }
  }

  // Re-index chunks
  return finalChunks.map((chunk, idx) => ({
    ...chunk,
    index: idx,
  }));
}

/**
 * Gets overlap text from the end of a chunk
 */
function getOverlapText(
  text: string,
  overlapSize: number,
  maxChunkSize: number
): string {
  if (text.length <= overlapSize) {
    return text;
  }

  // Try to find a sentence boundary within the overlap region
  const overlapStart = Math.max(0, text.length - overlapSize * 1.5);
  const overlapRegion = text.slice(overlapStart);
  
  // Find last sentence boundary
  const sentenceMatch = overlapRegion.match(/[.!?]\s+[A-Z]/);
  if (sentenceMatch && sentenceMatch.index !== undefined) {
    const sentenceEnd = overlapStart + sentenceMatch.index + 1;
    return text.slice(sentenceEnd).trim();
  }

  // Fallback: take last overlapSize characters, but try to break at word boundary
  const lastSpace = text.lastIndexOf(' ', text.length - overlapSize);
  if (lastSpace > text.length - overlapSize * 1.5) {
    return text.slice(lastSpace + 1).trim();
  }

  return text.slice(-overlapSize).trim();
}

/**
 * Splits a chunk by sentences if it's too large
 */
function splitBySentences(
  chunk: Chunk,
  options: Required<ChunkingOptions>
): Chunk[] {
  const sentences = chunk.text.split(/([.!?]\s+)/);
  const sentenceChunks: Chunk[] = [];
  let currentText = '';
  let currentStart = chunk.startChar;
  let index = chunk.index;

  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i] + (sentences[i + 1] || '');
    const trimmedSentence = sentence.trim();

    if (!trimmedSentence) continue;

    if (currentText.length + trimmedSentence.length > options.chunkSize) {
      if (currentText.trim().length >= options.minChunkSize) {
        sentenceChunks.push({
          text: currentText.trim(),
          index: index++,
          startChar: currentStart,
          endChar: currentStart + currentText.trim().length,
        });
      }

      // Start new chunk with overlap
      const overlapText = getOverlapText(
        currentText,
        options.overlap,
        options.chunkSize
      );
      currentText = overlapText + ' ' + trimmedSentence;
      currentStart = currentStart + currentText.length - overlapText.length - trimmedSentence.length - 1;
    } else {
      if (currentText.length > 0) {
        currentText += ' ' + trimmedSentence;
      } else {
        currentText = trimmedSentence;
        currentStart = chunk.startChar;
      }
    }
  }

  // Add final chunk
  if (currentText.trim().length >= options.minChunkSize) {
    sentenceChunks.push({
      text: currentText.trim(),
      index: index,
      startChar: currentStart,
      endChar: currentStart + currentText.trim().length,
    });
  }

  return sentenceChunks.length > 0 ? sentenceChunks : [chunk];
}

/**
 * Helper to get absolute character position in original text
 */
function getAbsolutePosition(
  text: string,
  paragraphIndex: number,
  paragraphs: string[]
): number {
  let position = 0;
  for (let i = 0; i < paragraphIndex && i < paragraphs.length; i++) {
    position += paragraphs[i].length + 2; // +2 for \n\n
  }
  return position;
}

/**
 * Estimates token count for a text (rough approximation: ~4 chars per token)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

