import { unlink, readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { platform, tmpdir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { downloadFileFromR2, isR2Configured } from './storage';

const MIME = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/**
 * Result of text extraction, including the method used
 */
export interface ExtractionResult {
  text: string;
  method: string;
}

/**
 * Extracts raw text from uploaded documents (PDF, PPTX, DOC, DOCX) stored in R2.
 *
 * Files are downloaded from R2 to a temporary location before processing.
 * Extraction is performed using native Node.js libraries.
 * 
 * @returns The extracted text and method used
 */
export async function extractTextFromDocument(
  documentId: number,
  storageKey: string,
  mimeType: string
): Promise<ExtractionResult> {
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

    // Extract text using native Node.js implementation
    const result = await extractTextNative(tempFilePath, mimeType, ext);
    return {
      text: result.text.trim(),
      method: result.method,
    };
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

async function extractTextNative(
  filePath: string,
  mimeType: string,
  ext: string | undefined
): Promise<ExtractionResult> {
  const startedAt = Date.now();
  console.log('[extraction] native start', { mimeType, ext });

  try {
    if (mimeType === MIME.pdf || ext === 'pdf') {
      return await extractPdf(filePath);
    }

    if (mimeType === MIME.docx || ext === 'docx') {
      const text = await extractDocx(filePath);
      return { text, method: 'node-word' };
    }

    if (mimeType === MIME.pptx || ext === 'pptx') {
      const text = await extractPptx(filePath);
      return { text, method: 'node-pptx' };
    }

    if (mimeType === MIME.doc || ext === 'doc') {
      const text = await extractDoc(filePath);
      return { text, method: 'node-word' };
    }

    throw new Error(`Unsupported file type: ${mimeType} (ext: ${ext})`);
  } finally {
    const durationMs = Date.now() - startedAt;
    console.log('[extraction] native done', { durationMs });
  }
}

/**
 * Checks if a system command is available
 */
async function hasCommand(cmd: string): Promise<boolean> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts text from PDF using OCR by converting pages to images
 * and running Tesseract OCR on each page using system commands
 */
async function extractPdfWithOCR(filePath: string): Promise<string> {
  const startedAt = Date.now();
  console.log('[extraction] OCR: starting PDF OCR extraction');
  
  // Check for required tools
  const hasPdftoppm = await hasCommand('pdftoppm');
  const hasTesseract = await hasCommand('tesseract');
  
  if (!hasPdftoppm || !hasTesseract) {
    throw new Error(
      'OCR tools missing. Please install: poppler-utils (pdftoppm) and tesseract-ocr. ' +
      'On macOS: brew install poppler tesseract. ' +
      'On Linux: apt-get install poppler-utils tesseract-ocr (or equivalent).'
    );
  }
  
  const tempDir = join(tmpdir(), `pdf-ocr-${randomBytes(6).toString('hex')}`);
  const { mkdir, readdir, rmdir } = await import('fs/promises');
  
  let tempImageFiles: string[] = [];
  
  try {
    // Create temporary directory for images
    await mkdir(tempDir, { recursive: true });
    const prefix = join(tempDir, 'page');
    
    // Render PDF pages to PNG images using pdftoppm
    // -png: output PNG format
    // -r 300: resolution 300 DPI (good balance of quality and speed)
    console.log('[extraction] OCR: converting PDF pages to images');
    await runSystemTool(
      ['pdftoppm', '-png', '-r', '300', filePath, prefix],
      300000, // 5 minute timeout for conversion
      100 * 1024 * 1024, // 100MB max output
      'pdftoppm'
    );
    
    // Read all generated PNG files
    const files = (await readdir(tempDir))
      .filter((f) => f.endsWith('.png'))
      .sort((a, b) => {
        // Sort numerically (page-1.png, page-2.png, etc.)
        const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
      });
    
    console.log('[extraction] OCR: found', files.length, 'pages to process');
    
    const pageTexts: string[] = [];
    
    // Run OCR on each page image
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imgPath = join(tempDir, file);
      tempImageFiles.push(imgPath);
      
      console.log('[extraction] OCR: processing page', { 
        pageNum: i + 1, 
        totalPages: files.length 
      });
      
      try {
        // Run tesseract OCR on the image
        // stdout: output to stdout instead of file
        // -l eng: use English language
        const ocrText = await runSystemTool(
          ['tesseract', imgPath, 'stdout', '-l', 'eng'],
          120000, // 2 minute timeout per page
          10 * 1024 * 1024, // 10MB max output per page
          'tesseract'
        );
        
        const trimmedText = ocrText.trim();
        if (trimmedText.length > 0) {
          pageTexts.push(trimmedText);
          console.log('[extraction] OCR: page extracted', { 
            pageNum: i + 1, 
            textLength: trimmedText.length 
          });
        } else {
          console.warn('[extraction] OCR: page returned empty text', { pageNum: i + 1 });
        }
      } catch (pageError) {
        console.error('[extraction] OCR: error processing page', { 
          pageNum: i + 1, 
          error: pageError 
        });
        // Continue with next page - don't fail entire extraction for one page
      }
    }
    
    const combinedText = pageTexts.join('\n\n');
    const durationMs = Date.now() - startedAt;
    console.log('[extraction] OCR: completed', { 
      durationMs, 
      pagesProcessed: pageTexts.length,
      totalPages: files.length,
      totalTextLength: combinedText.length 
    });
    
    return combinedText;
  } catch (error) {
    console.error('[extraction] OCR: failed', { error });
    throw error;
  } finally {
    // Clean up temporary directory and files
    try {
      for (const imagePath of tempImageFiles) {
        try {
          await unlink(imagePath);
        } catch (cleanupError) {
          console.warn('[extraction] OCR: failed to cleanup temp image', {
            imagePath,
            error: cleanupError,
          });
        }
      }
      
      // Remove temporary directory
      try {
        await rmdir(tempDir);
      } catch (rmdirError) {
        // Directory might not be empty, try to remove files first
        try {
          const remainingFiles = await readdir(tempDir);
          await Promise.all(remainingFiles.map(f => unlink(join(tempDir, f))));
          await rmdir(tempDir);
        } catch {
          console.warn('[extraction] OCR: failed to cleanup temp directory', {
            tempDir,
            error: rmdirError,
          });
        }
      }
    } catch (cleanupError) {
      console.warn('[extraction] OCR: cleanup error', { error: cleanupError });
    }
  }
}

/**
 * Checks if extracted text quality is good enough
 * Returns false if text appears to be empty, too short, or gibberish
 */
function isExtractionQualityGood(text: string): boolean {
  const trimmed = text.trim();
  
  // Empty or very short text
  if (trimmed.length < 50) {
    console.log('[extraction] quality check: text too short', { length: trimmed.length });
    return false;
  }

  // Check for gibberish - high ratio of non-alphanumeric characters
  // This catches cases where pdf-parse extracts corrupted data
  const alphanumericCount = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
  const totalChars = trimmed.length;
  const alphanumericRatio = alphanumericCount / totalChars;

  // If less than 30% of characters are alphanumeric, likely gibberish
  if (alphanumericRatio < 0.3) {
    console.log('[extraction] quality check: low alphanumeric ratio', { 
      ratio: alphanumericRatio.toFixed(2),
      alphanumericCount,
      totalChars
    });
    return false;
  }

  // Check for reasonable word count (at least 5 words)
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 5) {
    console.log('[extraction] quality check: too few words', { wordCount });
    return false;
  }

  return true;
}

async function extractPdf(filePath: string): Promise<ExtractionResult> {
  const buffer = await readFile(filePath);
  
  // Try pdf-parse first (fast, works for text-based PDFs)
  console.log('[extraction] pdf: attempting pdf-parse');
  let text = '';
  let extractionMethod = 'node-pdf';
  
  try {
    // pdf-parse ESM module: PDFParse is a class constructor, not a default export
    const mod = await import('pdf-parse');
    
    let data;
    // Check if default exists and is a function
    if ('default' in mod && typeof (mod as any).default === 'function') {
      data = await (mod as any).default(buffer);
    } else if (mod.PDFParse) {
      // PDFParse is a class constructor - create a wrapper function that uses it correctly
      const pdfParseWrapper = async (buf: Buffer) => {
        const instance = new mod.PDFParse(buf);
        // Check if instance is a promise (some constructors return promises)
        if (instance instanceof Promise) {
          return await instance;
        }
        // Check if instance has text property directly
        if (instance && typeof instance === 'object' && 'text' in instance) {
          return instance;
        }
        // Check if instance has a method to get data
        if (typeof (instance as any).getData === 'function') {
          return await (instance as any).getData();
        }
        if (typeof (instance as any).parse === 'function') {
          return await (instance as any).parse();
        }
        // Fallback: return instance as-is
        return instance;
      };
      data = await pdfParseWrapper(buffer);
    } else if (typeof (mod as any) === 'function') {
      data = await (mod as any)(buffer);
    } else {
      throw new Error(`pdf-parse module does not export usable function. Keys: ${Object.keys(mod).join(', ')}`);
    }

    // pdf-parse returns all text in the text property
    text = data.text || '';
    const trimmedText = text.trim();

    // Check if extraction quality is good
    if (trimmedText && isExtractionQualityGood(trimmedText)) {
      console.log('[extraction] pdf: pdf-parse succeeded', { textLength: trimmedText.length });
      return { text: trimmedText, method: 'node-pdf' };
    }

    // Quality check failed - fallback to OCR
    console.log('[extraction] pdf: pdf-parse quality check failed, falling back to OCR', {
      textLength: trimmedText.length,
      isEmpty: !trimmedText
    });
  } catch (error) {
    console.warn('[extraction] pdf: pdf-parse failed, falling back to OCR', { error });
  }

  // Fallback to OCR
  try {
    console.log('[extraction] pdf: starting OCR extraction');
    const ocrText = await extractPdfWithOCR(filePath);
    extractionMethod = 'node-pdf+ocr';
    
    // If OCR also fails or returns empty, return the original pdf-parse result if available
    if (!ocrText || ocrText.trim().length === 0) {
      console.warn('[extraction] pdf: OCR returned empty text, using pdf-parse result');
      return { text: text || '', method: 'node-pdf' };
    }
    
    console.log('[extraction] pdf: OCR succeeded', { textLength: ocrText.trim().length });
    return { text: ocrText.trim(), method: extractionMethod };
  } catch (ocrError) {
    console.error('[extraction] pdf: OCR failed', { error: ocrError });
    // Return whatever we got from pdf-parse, even if it's empty or poor quality
    return { text: text || '', method: 'node-pdf' };
  }
}

async function extractDocx(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const documentXml = zip.file('word/document.xml');
  if (!documentXml) {
    throw new Error('DOCX file missing word/document.xml');
  }

  const xmlContent = await documentXml.async('string');
  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: '_text',
    isArray: (name) => {
      // Handle arrays for common Word elements
      return ['w:p', 'w:r', 'w:t'].includes(name);
    },
  });
  const parsed = parser.parse(xmlContent);

  const paragraphs: string[] = [];

  // Find all paragraph nodes (w:p)
  const findAllParagraphs = (node: any): any[] => {
    const results: any[] = [];
    
    if (!node || typeof node !== 'object') {
      return results;
    }

    // Check if this node itself is a paragraph or contains paragraphs
    if (node['w:p']) {
      const paras = Array.isArray(node['w:p']) ? node['w:p'] : [node['w:p']];
      results.push(...paras);
    }

    // Recursively search children
    for (const key in node) {
      if (key !== '_text' && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach((item: any) => {
            results.push(...findAllParagraphs(item));
          });
        } else {
          results.push(...findAllParagraphs(node[key]));
        }
      }
    }

    return results;
  };

  const paragraphNodes = findAllParagraphs(parsed);

  // Extract text from each paragraph
  for (const para of paragraphNodes) {
    const parts: string[] = [];

    // Recursively extract text from all nodes in the paragraph
    const extractFromNode = (n: any): void => {
      if (!n || typeof n !== 'object') return;

      // Text node (w:t)
      if (n['w:t']) {
        const textNodes = Array.isArray(n['w:t']) ? n['w:t'] : [n['w:t']];
        textNodes.forEach((t: any) => {
          if (t && t._text) {
            parts.push(String(t._text));
          } else if (typeof t === 'string') {
            parts.push(t);
          }
        });
      }

      // Tab node
      if (n['w:tab']) {
        parts.push('\t');
      }

      // Break nodes
      if (n['w:br'] || n['w:cr']) {
        parts.push('\n');
      }

      // Recursively process children
      for (const key in n) {
        if (key !== '_text' && typeof n[key] === 'object') {
          if (Array.isArray(n[key])) {
            n[key].forEach((item: any) => extractFromNode(item));
          } else {
            extractFromNode(n[key]);
          }
        }
      }
    };

    extractFromNode(para);

    const paragraphText = parts.join('').trim();
    if (paragraphText) {
      paragraphs.push(paragraphText);
    }
  }

  return paragraphs.join('\n').trim();
}

async function extractPptx(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  // Find all slide XML files
  const slideFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
  );

  // Sort slides by number
  const slideIndex = (name: string): number => {
    const base = name.split('/').pop() || '';
    const digits = base.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  };

  slideFiles.sort((a, b) => slideIndex(a) - slideIndex(b));

  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: '_text',
  });

  const slideTexts: string[] = [];

  for (const slideName of slideFiles) {
    const slideFile = zip.file(slideName);
    if (!slideFile) continue;

    const xmlContent = await slideFile.async('string');
    const parsed = parser.parse(xmlContent);

    const texts: string[] = [];

    const collectText = (node: any): void => {
      if (!node || typeof node !== 'object') return;

      // Check for text nodes in drawing namespace
      if (node['a:t']) {
        if (Array.isArray(node['a:t'])) {
          node['a:t'].forEach((t: any) => {
            if (t._text) texts.push(String(t._text));
            else if (typeof t === 'string') texts.push(t);
          });
        } else {
          if (node['a:t']._text) texts.push(String(node['a:t']._text));
          else if (typeof node['a:t'] === 'string') texts.push(node['a:t']);
        }
      }

      // Recursively process children
      for (const key in node) {
        if (key !== '_text' && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach((item: any) => collectText(item));
          } else {
            collectText(node[key]);
          }
        }
      }
    };

    collectText(parsed);

    if (texts.length > 0) {
      slideTexts.push(texts.join('\n').trim());
    }
  }

  return slideTexts.join('\n\n').trim();
}

async function extractDoc(filePath: string): Promise<string> {
  const timeoutMs = 120000; // 2 minutes timeout
  const maxBytes = 50 * 1024 * 1024; // 50MB max output

  // Try textutil on macOS
  if (platform() === 'darwin' && existsSync('/usr/bin/textutil')) {
    return await runSystemTool(
      ['/usr/bin/textutil', '-convert', 'txt', '-stdout', filePath],
      timeoutMs,
      maxBytes,
      'textutil'
    );
  }

  // Try antiword
  const antiwordPath = await findCommand('antiword');
  if (antiwordPath) {
    return await runSystemTool([antiwordPath, filePath], timeoutMs, maxBytes, 'antiword');
  }

  // Try LibreOffice/soffice
  const sofficePath = await findCommand('soffice') || await findCommand('libreoffice');
  if (sofficePath) {
    const tempDir = tmpdir();
    const outputPath = join(tempDir, `doc-extract-${Date.now()}.txt`);

    try {
      await runSystemTool(
        [
          sofficePath,
          '--headless',
          '--convert-to',
          'txt:Text',
          '--outdir',
          tempDir,
          filePath,
        ],
        timeoutMs,
        maxBytes,
        'soffice'
      );

      // Find the output file
      const fs = await import('fs/promises');
      const files = await fs.readdir(tempDir);
      const txtFiles = files.filter((f) => f.toLowerCase().endsWith('.txt'));

      if (txtFiles.length > 0) {
        // Find the most recently created txt file
        let latestFile = txtFiles[0];
        let latestTime = 0;

        for (const file of txtFiles) {
          const filePath = join(tempDir, file);
          const stats = await fs.stat(filePath);
          if (stats.mtimeMs > latestTime) {
            latestTime = stats.mtimeMs;
            latestFile = file;
          }
        }

        const content = await readFile(join(tempDir, latestFile), 'utf-8');
        // Clean up the output file
        try {
          await fs.unlink(join(tempDir, latestFile));
        } catch {
          // Ignore cleanup errors
        }
        return content.trim();
      }
    } catch (error) {
      // If conversion failed, try to clean up
      try {
        const fs = await import('fs/promises');
        await fs.unlink(outputPath).catch(() => {
          // Ignore
        });
      } catch {
        // Ignore
      }
      throw error;
    }
  }

  throw new Error(
    'Unable to extract .doc on this system. Convert to .docx, or install "antiword" or LibreOffice.'
  );
}

async function findCommand(command: string): Promise<string | null> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(`which ${command}`);
    const path = stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}

async function runSystemTool(
  command: string[],
  timeoutMs: number,
  maxBytes: number,
  toolName: string
): Promise<string> {
  const startedAt = Date.now();
  console.log(`[extraction] ${toolName} start`, { command: command[0] });

  const child = spawn(command[0], command.slice(1), {
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
        `${toolName} extraction timed out after ${timeoutMs}ms (file ${command[command.length - 1]})`
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
          `${toolName} extraction output exceeded ${maxBytes} bytes (file ${command[command.length - 1]})`
        );
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      const text = chunk.toString('utf-8').trim();
      if (text) console.warn(`[extraction] ${toolName} stderr`, text);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;

      const durationMs = Date.now() - startedAt;
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();

      if (code !== 0) {
        console.error(`[extraction] ${toolName} exit`, { code, signal, durationMs });
        reject(
          new Error(
            `${toolName} extraction failed (code ${code}${signal ? `, signal ${signal}` : ''})${stderr ? `\n\n${stderr}` : ''}`
          )
        );
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      console.log(`[extraction] ${toolName} done`, { durationMs, stdoutBytes });
      resolve(stdout);
    });
  });
}
