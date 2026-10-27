CREATE TYPE "public"."waitlist_interest" AS ENUM('individual', 'institutional');--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"interest" "waitlist_interest" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_email_interest_idx" ON "waitlist" USING btree (lower("email"),"interest");