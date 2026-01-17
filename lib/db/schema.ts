import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Custom type for pgvector
// Note: pgvector stores vectors as arrays in PostgreSQL
// When inserting, we pass the array directly and PostgreSQL handles conversion
// When reading, PostgreSQL returns the vector as a string representation
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    // Convert array to pgvector format: [1,2,3]
    // PostgreSQL will parse this string representation
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string | number[]): number[] {
    // Handle both string and array inputs
    if (Array.isArray(value)) {
      return value;
    }
    // Remove brackets and parse string representation
    const cleaned = String(value).replace(/[\[\]]/g, '');
    return cleaned.split(',').map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));
  },
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  // Subscription fields
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }).default('free'),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
  subscriptionPeriodStart: timestamp('subscription_period_start'),
  subscriptionPeriodEnd: timestamp('subscription_period_end'),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const usersRelations = relations(users, ({ many }) => ({
  activityLogs: many(activityLogs),
  documents: many(documents),
  quizzes: many(quizzes),
  usageTracking: many(usageTracking),
  quizAttempts: many(quizAttempts),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
}

// Slide2Quiz tables
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  filename: varchar('filename', { length: 255 }).notNull(),
  storageKey: text('storage_key').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 })
    .notNull()
    .default('uploaded'),
  pageCount: integer('page_count'),
  summary: jsonb('summary'), // Array of summary sections with title and points, or legacy flat array of strings
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const extractions = pgTable('extractions', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => documents.id),
  rawText: text('raw_text').notNull(),
  method: varchar('method', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const documentChunks = pgTable('document_chunks', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => documents.id),
  extractionId: integer('extraction_id').references(() => extractions.id),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  embedding: vector('embedding').notNull(),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const quizzes = pgTable('quizzes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  documentId: integer('document_id')
    .notNull()
    .references(() => documents.id),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 })
    .notNull()
    .default('generating'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id')
    .notNull()
    .references(() => quizzes.id),
  type: varchar('type', { length: 50 }).notNull().default('multiple_choice'),
  prompt: text('prompt').notNull(),
  choices: jsonb('choices'),
  answer: jsonb('answer'),
  explanation: text('explanation'),
  sourceRef: jsonb('source_ref'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Relations for Slide2Quiz tables
export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  extractions: many(extractions),
  quizzes: many(quizzes),
  chunks: many(documentChunks),
}));

export const extractionsRelations = relations(extractions, ({ one, many }) => ({
  document: one(documents, {
    fields: [extractions.documentId],
    references: [documents.id],
  }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
  extraction: one(extractions, {
    fields: [documentChunks.extractionId],
    references: [extractions.id],
  }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  user: one(users, {
    fields: [quizzes.userId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [quizzes.documentId],
    references: [documents.id],
  }),
  questions: many(questions),
  attempts: many(quizAttempts),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
}));

export const quizAttempts = pgTable('quiz_attempts', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id')
    .notNull()
    .references(() => quizzes.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  answers: jsonb('answers').notNull(), // Record<questionId, answerIndex>
  score: integer('score').notNull(), // Percentage (0-100)
  completedAt: timestamp('completed_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizAttempts.quizId],
    references: [quizzes.id],
  }),
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
}));

// Usage tracking table
export const usageTracking = pgTable('usage_tracking', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  quizGenerations: integer('quiz_generations').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, {
    fields: [usageTracking.userId],
    references: [users.id],
  }),
}));

// Type exports for Slide2Quiz tables
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Extraction = typeof extractions.$inferSelect;
export type NewExtraction = typeof extractions.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type UsageTracking = typeof usageTracking.$inferSelect;
export type NewUsageTracking = typeof usageTracking.$inferInsert;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;