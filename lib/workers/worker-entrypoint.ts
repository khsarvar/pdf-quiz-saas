/**
 * Worker Entrypoint
 * Starts all SQS workers for background job processing
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { startDocumentProcessor } from './document-processor';
import { startQuizGenerator } from './quiz-generator';

async function main(): Promise<void> {
  console.log('[worker] Starting worker processes...');
  console.log('[worker] Environment:', {
    nodeEnv: process.env.NODE_ENV,
    awsRegion: process.env.AWS_REGION,
    documentQueue: process.env.SQS_DOCUMENT_QUEUE_NAME || 'document-processing-queue',
    quizQueue: process.env.SQS_QUIZ_QUEUE_NAME || 'quiz-generation-queue',
  });

  // Start both workers concurrently
  await Promise.all([
    startDocumentProcessor(),
    startQuizGenerator(),
  ]);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[worker] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[worker] Received SIGINT, shutting down...');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[worker] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[worker] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the workers
main().catch((error) => {
  console.error('[worker] Fatal error:', error);
  process.exit(1);
});
