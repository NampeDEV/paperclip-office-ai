DROP INDEX IF EXISTS "office_scenes_company_uq";--> statement-breakpoint
ALTER TABLE "office_scenes" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
ALTER TABLE "office_scenes" ADD COLUMN IF NOT EXISTS "characters" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'office_scenes_project_id_projects_id_fk'
      AND conrelid = 'public.office_scenes'::regclass
  ) THEN
    ALTER TABLE "office_scenes"
      ADD CONSTRAINT "office_scenes_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "office_scenes_company_fallback_active_uq" ON "office_scenes" USING btree ("company_id") WHERE "office_scenes"."project_id" is null and "office_scenes"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "office_scenes_company_project_active_uq" ON "office_scenes" USING btree ("company_id","project_id") WHERE "office_scenes"."project_id" is not null and "office_scenes"."is_active" = true;
