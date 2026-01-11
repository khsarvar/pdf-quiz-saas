import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// R2 endpoint URL format: https://<account-id>.r2.cloudflarestorage.com
const R2_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : undefined;

/**
 * Gets or creates the R2 S3 client
 */
function getR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error(
      'R2 configuration missing. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME environment variables.'
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Generates a unique storage key for a file
 */
export function generateStorageKey(filename: string): string {
  const ext = filename.split('.').pop() || '';
  const randomId = randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${randomId}.${ext}`;
}

/**
 * Generates a presigned PUT URL for direct upload to R2
 * @param storageKey The unique storage key
 * @param contentType The MIME type of the file
 * @param expiresIn Expiration time in seconds (default: 15 minutes)
 * @returns Presigned URL for uploading
 */
export async function generatePresignedUploadUrl(
  storageKey: string,
  contentType: string,
  expiresIn: number = 15 * 60 // 15 minutes default
): Promise<string> {
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Generates a presigned GET URL for downloading from R2
 * @param storageKey The unique storage key
 * @param expiresIn Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL for downloading
 */
export async function generatePresignedDownloadUrl(
  storageKey: string,
  expiresIn: number = 60 * 60 // 1 hour default
): Promise<string> {
  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Downloads a file from R2 to a temporary location
 * @param storageKey The unique storage key
 * @returns Path to the temporary file
 */
export async function downloadFileFromR2(storageKey: string): Promise<string> {
  const client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: storageKey,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error(`File not found in R2: ${storageKey}`);
  }

  // Create temporary file path
  const tempDir = tmpdir();
  const tempFilePath = join(tempDir, `r2-${storageKey.replace(/[^a-zA-Z0-9.-]/g, '_')}`);

  // Ensure temp directory exists
  try {
    await mkdir(tempDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }

  // Stream the file to disk
  // AWS SDK v3 returns the body as a Readable stream
  if (response.Body instanceof Readable) {
    const writeStream = createWriteStream(tempFilePath);
    await pipeline(response.Body, writeStream);
  } else if (response.Body instanceof ReadableStream) {
    // For ReadableStream (browser), convert to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    await writeFile(tempFilePath, buffer);
  } else {
    // Fallback: try to read as async iterable
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    await writeFile(tempFilePath, buffer);
  }

  return tempFilePath;
}

/**
 * Gets the public URL for a file in R2 (if R2_PUBLIC_URL is configured)
 * @param storageKey The unique storage key
 * @returns Public URL or null if not configured
 */
export function getPublicUrl(storageKey: string): string | null {
  if (!R2_PUBLIC_URL) {
    return null;
  }
  // Remove trailing slash if present
  const baseUrl = R2_PUBLIC_URL.replace(/\/$/, '');
  return `${baseUrl}/${storageKey}`;
}

/**
 * Checks if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET_NAME
  );
}