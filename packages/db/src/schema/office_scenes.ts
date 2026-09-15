import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { OfficeSeat } from "@paperclipai/shared";
import { assets } from "./assets.js";
import { companies } from "./companies.js";

export const officeScenes = pgTable(
  "office_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Office"),
    backgroundAssetId: uuid("background_asset_id").references(() => assets.id, { onDelete: "set null" }),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    seats: jsonb("seats").$type<OfficeSeat[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUq: uniqueIndex("office_scenes_company_uq").on(table.companyId),
  }),
);
