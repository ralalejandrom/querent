CREATE TYPE "public"."partner_type" AS ENUM('university', 'institute', 'publisher', 'other');--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "organization" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "partner_type" "partner_type";