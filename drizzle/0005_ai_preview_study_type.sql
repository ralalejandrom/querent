CREATE TYPE "public"."study_type" AS ENUM('randomized_trial', 'systematic_review', 'cohort', 'case_control', 'cross_sectional', 'case_series', 'animal', 'in_vitro', 'computational', 'qualitative', 'other');--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "study_type" "study_type";--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "abstract" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "ai_summary" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "ai_summary_at" timestamp with time zone;