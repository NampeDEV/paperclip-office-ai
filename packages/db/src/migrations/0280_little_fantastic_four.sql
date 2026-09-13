CREATE TABLE IF NOT EXISTS "catalog_team_install_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"catalog_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalog_team_install_receipts_company_id_companies_id_fk'
      AND conrelid = 'public.catalog_team_install_receipts'::regclass
  ) THEN
    ALTER TABLE "catalog_team_install_receipts"
      ADD CONSTRAINT "catalog_team_install_receipts_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_team_install_receipts_company_catalog_key_uq" ON "catalog_team_install_receipts" USING btree ("company_id","catalog_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_team_install_receipts_company_created_idx" ON "catalog_team_install_receipts" USING btree ("company_id","created_at");
