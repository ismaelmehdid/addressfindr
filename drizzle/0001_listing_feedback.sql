CREATE TYPE "public"."listing_feedback_reason" AS ENUM('wrong_commune', 'wrong_dwellings', 'address_missing', 'unsure');--> statement-breakpoint
CREATE TYPE "public"."listing_feedback_verdict" AS ENUM('confirmed', 'none_match');--> statement-breakpoint
CREATE TABLE "listing_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"listing_url" text NOT NULL,
	"verdict" "listing_feedback_verdict" NOT NULL,
	"confirmed_dpe_number" text,
	"reason" "listing_feedback_reason",
	"comment" text,
	"candidates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_feedback_confirmed_dpe_number_check" CHECK (("listing_feedback"."verdict" = 'confirmed') = ("listing_feedback"."confirmed_dpe_number" is not null)),
	CONSTRAINT "listing_feedback_detail_check" CHECK ("listing_feedback"."verdict" = 'none_match' or ("listing_feedback"."reason" is null and "listing_feedback"."comment" is null)),
	CONSTRAINT "listing_feedback_comment_length_check" CHECK (char_length("listing_feedback"."comment") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "listing_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_feedback_search_id_unique" ON "listing_feedback" USING btree ("search_id");