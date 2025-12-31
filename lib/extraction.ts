import { join } from 'path';
import { spawn } from 'child_process';
import { unlink } from 'fs/promises';
import { downloadFileFromR2, isR2Configured } from './storage';

const MIME = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/**
 * Extracts raw text from uploaded documents (PDF, PPTX, DOC, DOCX) stored in R2.
 *
 * Note: Extraction is performed via the Python script (`scripts/extract_text.py`).
 * Files are downloaded from R2 to a temporary location before processing.
 */
export async function extractTextFromDocument(
  documentId: number,
  storageKey: string,
  mimeType: string
): Promise<string> {
  console.log('[extraction] start', { documentId, storageKey, mimeType });

  // Check if R2 is configured
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  const ext = getExtension(storageKey);
  let tempFilePath: string | null = null;

  try {
    // Validate file type
    if (
      !(
        mimeType === MIME.doc ||
        mimeType === MIME.docx ||
        mimeType === MIME.pdf ||
        mimeType === MIME.pptx ||
        ext === 'doc' ||
        ext === 'docx' ||
        ext === 'pdf' ||
        ext === 'pptx'
      )
    ) {
      throw new Error(
        `Unsupported mime type for extraction: ${mimeType} (document ${documentId})`
      );
    }

    // Download file from R2 to temporary location
    console.log('[extraction] downloading from R2', { storageKey });
    tempFilePath = await downloadFileFromR2(storageKey);
    console.log('[extraction] downloaded to temp file', { tempFilePath });

    // Extract text using Python script
    const text = await extractWithPython(tempFilePath, mimeType);
    return text.trim();
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
        console.log('[extraction] cleaned up temp file', { tempFilePath });
      } catch (error) {
        // Log but don't throw - cleanup errors shouldn't fail the extraction
        console.warn('[extraction] failed to clean up temp file', {
          tempFilePath,
          error,
        });
      }
    }
  }
}

function getExtension(filename: string): string | undefined {
  const ext = filename.split('.').pop();
  return ext ? ext.toLowerCase() : undefined;
}

async function extractWithPython(filePath: string, mimeType: string): Promise<string> {
  const pythonPath = process.env.PYTHON_PATH || 'python3';
  const scriptPath = join(process.cwd(), 'scripts', 'extract_text.py');
  const timeoutMs = Number(process.env.PYTHON_EXTRACT_TIMEOUT_MS || '120000');
  const maxBytes = Number(
    process.env.PYTHON_EXTRACT_MAX_BYTES || String(50 * 1024 * 1024)
  );

  const startedAt = Date.now();
  console.log('[extraction] python start', { mimeType, timeoutMs, maxBytes });

  const child = spawn(pythonPath, [scriptPath, '--path', filePath, '--mime', mimeType], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return await new Promise<string>((resolve, reject) => {
    let stdoutBytes = 0;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let finished = false;

    const kill = (reason: string) => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(new Error(reason));
    };

    const timeout = setTimeout(() => {
      kill(
        `Python extraction timed out after ${timeoutMs}ms for ${mimeType} (file ${filePath})`
      );
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      reject(error);
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBytes) {
        clearTimeout(timeout);
        kill(
          `Python extraction output exceeded ${maxBytes} bytes for ${mimeType} (file ${filePath})`
        );
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      // Stream python stderr so you can see progress/warnings in dev logs.
      const text = chunk.toString('utf-8').trim();
      if (text) console.warn('[extraction] python stderr', text);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;

      const durationMs = Date.now() - startedAt;
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();

      if (code !== 0) {
        console.error('[extraction] python exit', { code, signal, durationMs });
        reject(
          new Error(
            `Python extraction failed (code ${code}${signal ? `, signal ${signal}` : ''}) for ${mimeType} (file ${filePath})${stderr ? `\n\n${stderr}` : ''}`
          )
        );
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      console.log('[extraction] python done', { durationMs, stdoutBytes });
      resolve(stdout);
    });
  });
}
