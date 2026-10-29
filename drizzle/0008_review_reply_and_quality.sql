ALTER TABLE "reviews" ADD COLUMN "public_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "helpfulness" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "led_to_revision" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "author_rated_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "reviews" SET "public_at" = "completed_at" WHERE "status" = 'completed' AND "public_at" IS NULL;
