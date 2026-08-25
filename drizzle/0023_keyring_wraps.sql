CREATE TABLE "keyring_wraps" (
	"credential_id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"blob" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyring_wraps" ADD CONSTRAINT "keyring_wraps_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyring_wraps" ADD CONSTRAINT "keyring_wraps_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyring_wraps_member_idx" ON "keyring_wraps" USING btree ("member_id");