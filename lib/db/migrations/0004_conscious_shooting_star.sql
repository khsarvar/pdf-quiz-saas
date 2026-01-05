-- Create pgvector extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"extraction_id" integer,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"token_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Create index on embedding column for faster similarity searches
-- Using ivfflat index (good for up to ~1M vectors)
-- Note: Index must be created after data is inserted, or use CREATE INDEX CONCURRENTLY
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_idx" ON "document_chunks" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);