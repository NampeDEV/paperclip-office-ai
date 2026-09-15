import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

// A catalog import can create several native resources and the portability
// importer is deliberately not retried after an interrupted write. This small
// receipt is the company/catalog-scoped claim and replay record for callers
// that supply an idempotency key. It stores only the redacted response, never
// request secrets or an error body that could echo one.
export const catalogTeamInstallReceipts = pgTable(
  "catalog_team_install_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    // running | succeeded | failed | ambiguous
    status: text("status").notNull().default("running"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCatalogKeyUq: uniqueIndex("catalog_team_install_receipts_company_catalog_key_uq").on(
      table.companyId,
      table.catalogId,
      table.idempotencyKey,
    ),
    companyCreatedIdx: index("catalog_team_install_receipts_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);
