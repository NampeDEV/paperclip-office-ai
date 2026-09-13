CREATE TABLE "office_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text DEFAULT 'Office' NOT NULL,
	"background_asset_id" uuid,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"seats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "office_scenes" ADD CONSTRAINT "office_scenes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_scenes" ADD CONSTRAINT "office_scenes_background_asset_id_assets_id_fk" FOREIGN KEY ("background_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "office_scenes_company_uq" ON "office_scenes" USING btree ("company_id");