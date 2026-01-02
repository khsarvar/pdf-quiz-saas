ALTER TABLE IF EXISTS "invitations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "team_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "teams" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" DROP CONSTRAINT IF EXISTS "activity_logs_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "team_id";--> statement-breakpoint
DROP TABLE IF EXISTS "invitations";--> statement-breakpoint
DROP TABLE IF EXISTS "team_members";--> statement-breakpoint
DROP TABLE IF EXISTS "teams";
