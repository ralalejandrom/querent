CREATE TYPE "public"."career_stage" AS ENUM('phd_student', 'postdoc', 'faculty', 'clinician', 'industry', 'other');--> statement-breakpoint
CREATE TABLE "reviewer_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"field" text NOT NULL,
	"institution" text NOT NULL,
	"career_stage" "career_stage" NOT NULL,
	"orcid_id" text,
	"reviews_per_month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_applications_email_idx" ON "reviewer_applications" USING btree (lower("email"));