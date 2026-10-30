ALTER TABLE "posts" ADD COLUMN "conflicts" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "limitations" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "media_credit" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "ai_use" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "co_reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "co_reviewer_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_co_reviewer_id_users_id_fk" FOREIGN KEY ("co_reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;