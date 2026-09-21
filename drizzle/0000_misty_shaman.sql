CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "file" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"original_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"index_status" text DEFAULT 'pending' NOT NULL,
	"index_error" text,
	"vision_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "failed_sync_operation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"operation" text NOT NULL,
	"source" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"is_permanently_failed" boolean DEFAULT false NOT NULL,
	"next_retry_at" timestamp DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp,
	"payload" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "failed_sync_operation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zeroentropy_collection" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"collection_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "zeroentropy_collection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zeroentropy_entity" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"doc_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_indexed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "zeroentropy_entity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failed_sync_operation" ADD CONSTRAINT "failed_sync_operation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeroentropy_collection" ADD CONSTRAINT "zeroentropy_collection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeroentropy_entity" ADD CONSTRAINT "zeroentropy_entity_collection_id_zeroentropy_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."zeroentropy_collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_account_id_idx" ON "account" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_provider_id_idx" ON "account" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "file_storage_key_unique" ON "file" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "file_user_id_idx" ON "file" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "file_index_status_idx" ON "file" USING btree ("index_status");--> statement-breakpoint
CREATE INDEX "file_user_status_created_idx" ON "file" USING btree ("user_id","status","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "failed_sync_operation_entity_unique" ON "failed_sync_operation" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "failed_sync_operation_event_idx" ON "failed_sync_operation" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "failed_sync_operation_user_idx" ON "failed_sync_operation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "failed_sync_operation_next_retry_idx" ON "failed_sync_operation" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "failed_sync_operation_entity_idx" ON "failed_sync_operation" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zeroentropy_collection_user_unique" ON "zeroentropy_collection" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zeroentropy_collection_name_unique" ON "zeroentropy_collection" USING btree ("collection_name");--> statement-breakpoint
CREATE UNIQUE INDEX "zeroentropy_entity_unique" ON "zeroentropy_entity" USING btree ("collection_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "zeroentropy_entity_collection_idx" ON "zeroentropy_entity" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "zeroentropy_entity_entity_idx" ON "zeroentropy_entity" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "zeroentropy_entity_status_idx" ON "zeroentropy_entity" USING btree ("status");