import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  type Message,
} from '@aws-sdk/client-sqs';

// SQS Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const DOCUMENT_PROCESSING_QUEUE = process.env.SQS_DOCUMENT_QUEUE_NAME || 'document-processing-queue';
const QUIZ_GENERATION_QUEUE = process.env.SQS_QUIZ_QUEUE_NAME || 'quiz-generation-queue';

let sqsClient: SQSClient | null = null;

function getSQSClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: AWS_REGION,
      // Credentials are automatically loaded from environment variables or IAM role
      // AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or ECS task role
    });
  }
  return sqsClient;
}

// Cache queue URLs to avoid repeated API calls
const queueUrlCache: Record<string, string> = {};

async function getQueueUrl(queueName: string): Promise<string> {
  if (queueUrlCache[queueName]) {
    return queueUrlCache[queueName];
  }

  // Check if a full URL is provided in environment variables
  const envUrl = queueName === DOCUMENT_PROCESSING_QUEUE
    ? process.env.SQS_DOCUMENT_QUEUE_URL
    : process.env.SQS_QUIZ_QUEUE_URL;

  if (envUrl) {
    queueUrlCache[queueName] = envUrl;
    return envUrl;
  }

  const client = getSQSClient();
  const command = new GetQueueUrlCommand({ QueueName: queueName });
  const response = await client.send(command);

  if (!response.QueueUrl) {
    throw new Error(`Could not get URL for queue: ${queueName}`);
  }

  queueUrlCache[queueName] = response.QueueUrl;
  return response.QueueUrl;
}

// Message Types
export interface DocumentProcessingMessage {
  type: 'document-processing';
  documentId: number;
  storageKey: string;
  mimeType: string;
  userId: number;
  timestamp: string;
}

export interface QuizGenerationMessage {
  type: 'quiz-generation';
  quizId: number;
  documentId: number;
  questionCount: number;
  timestamp: string;
}

export type SQSJobMessage = DocumentProcessingMessage | QuizGenerationMessage;

/**
 * Send a document processing job to SQS
 */
export async function enqueueDocumentProcessing(
  documentId: number,
  storageKey: string,
  mimeType: string,
  userId: number
): Promise<string> {
  const client = getSQSClient();
  const queueUrl = await getQueueUrl(DOCUMENT_PROCESSING_QUEUE);

  const message: DocumentProcessingMessage = {
    type: 'document-processing',
    documentId,
    storageKey,
    mimeType,
    userId,
    timestamp: new Date().toISOString(),
  };

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      MessageType: {
        DataType: 'String',
        StringValue: 'document-processing',
      },
    },
    // Use document ID for deduplication within 5 minute window
    MessageDeduplicationId: `doc-${documentId}-${Date.now()}`,
    MessageGroupId: `document-${documentId}`,
  });

  const response = await client.send(command);
  console.log('[sqs] Enqueued document processing job', {
    documentId,
    messageId: response.MessageId
  });

  return response.MessageId || '';
}

/**
 * Send a quiz generation job to SQS
 */
export async function enqueueQuizGeneration(
  quizId: number,
  documentId: number,
  questionCount: number
): Promise<string> {
  const client = getSQSClient();
  const queueUrl = await getQueueUrl(QUIZ_GENERATION_QUEUE);

  const message: QuizGenerationMessage = {
    type: 'quiz-generation',
    quizId,
    documentId,
    questionCount,
    timestamp: new Date().toISOString(),
  };

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      MessageType: {
        DataType: 'String',
        StringValue: 'quiz-generation',
      },
    },
    // Use quiz ID for deduplication
    MessageDeduplicationId: `quiz-${quizId}-${Date.now()}`,
    MessageGroupId: `quiz-${quizId}`,
  });

  const response = await client.send(command);
  console.log('[sqs] Enqueued quiz generation job', {
    quizId,
    documentId,
    messageId: response.MessageId
  });

  return response.MessageId || '';
}

/**
 * Receive messages from a queue (for workers)
 */
export async function receiveMessages(
  queueName: string,
  maxMessages: number = 10,
  waitTimeSeconds: number = 20
): Promise<Message[]> {
  const client = getSQSClient();
  const queueUrl = await getQueueUrl(queueName);

  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: waitTimeSeconds, // Long polling
    MessageAttributeNames: ['All'],
    VisibilityTimeout: 300, // 5 minutes to process
  });

  const response = await client.send(command);
  return response.Messages || [];
}

/**
 * Delete a message from the queue after successful processing
 */
export async function deleteMessage(
  queueName: string,
  receiptHandle: string
): Promise<void> {
  const client = getSQSClient();
  const queueUrl = await getQueueUrl(queueName);

  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });

  await client.send(command);
}

/**
 * Parse a message body into a typed job message
 */
export function parseMessage(body: string): SQSJobMessage | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed.type === 'document-processing' || parsed.type === 'quiz-generation') {
      return parsed as SQSJobMessage;
    }
    return null;
  } catch (error) {
    console.error('[sqs] Failed to parse message:', error);
    return null;
  }
}

// Export queue names for workers
export const QUEUES = {
  DOCUMENT_PROCESSING: DOCUMENT_PROCESSING_QUEUE,
  QUIZ_GENERATION: QUIZ_GENERATION_QUEUE,
};
