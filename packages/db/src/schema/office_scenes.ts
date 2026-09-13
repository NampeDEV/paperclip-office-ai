import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { OfficeCharacter, OfficeSeat } from "@paperclipai/shared";
import { assets } from "./assets.js";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const officeScenes = pgTable(
  "office_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Office"),
    backgroundAssetId: uuid("background_asset_id").references(() => assets.id, { onDelete: "set null" }),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    seats: jsonb("seats").$type<OfficeSeat[]>().notNull().default(sql`'[]'::jsonb`),
    characters: jsonb("characters").$type<OfficeCharacter[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFallbackActiveUq: uniqueIndex("office_scenes_company_fallback_active_uq")
      .on(table.companyId)
      .where(sql`${table.projectId} is null and ${table.isActive} = true`),
    companyProjectActiveUq: uniqueIndex("office_scenes_company_project_active_uq")
      .on(table.companyId, table.projectId)
      .where(sql`${table.projectId} is not null and ${table.isActive} = true`),
  }),
);
