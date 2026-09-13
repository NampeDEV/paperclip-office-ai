import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const cleanups: Array<() => Promise<void>> = [];
const support = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = support.supported ? describe : describe.skip;

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function migrationStatements(): Promise<string[]> {
  const source = await readFile(
    fileURLToPath(new URL("./migrations/0279_chemical_fat_cobra.sql", import.meta.url)),
    "utf8",
  );
  return source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describeEmbeddedPostgres("office scenes project migration", () => {
  it("replays safely, preserves the company fallback, and permits an owned project override", async () => {
    const database = await startEmbeddedPostgresTestDatabase("office-scenes-migration-");
    cleanups.push(database.cleanup);
    const sql = postgres(database.connectionString, { max: 1, onnotice: () => {} });
    cleanups.push(async () => sql.end());
    const companyId = "10000000-0000-4000-8000-000000000279";
    const fallbackId = "20000000-0000-4000-8000-000000000279";
    const projectId = "30000000-0000-4000-8000-000000000279";

    await sql`
      INSERT INTO companies (id, name, issue_prefix)
      VALUES (${companyId}, 'Office scene migration', 'OSM')
    `;
    await sql`
      INSERT INTO office_scenes (id, company_id, name, image_width, image_height, seats)
      VALUES (${fallbackId}, ${companyId}, 'Existing company layout', 1672, 941, '[]'::jsonb)
    `;

    const statements = await migrationStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) await sql.unsafe(statement);
    for (const statement of statements) await sql.unsafe(statement);

    const fallbacks = await sql<{
      id: string;
      project_id: string | null;
      name: string;
      characters: unknown[];
    }[]>`
      SELECT id, project_id, name, characters
      FROM office_scenes
      WHERE company_id = ${companyId} AND project_id IS NULL
    `;
    expect(fallbacks).toEqual([{
      id: fallbackId,
      project_id: null,
      name: "Existing company layout",
      characters: [],
    }]);

    await sql`
      INSERT INTO projects (id, company_id, name)
      VALUES (${projectId}, ${companyId}, 'Project override')
    `;
    await sql`
      INSERT INTO office_scenes (company_id, project_id, name, image_width, image_height, seats)
      VALUES (${companyId}, ${projectId}, 'Project layout', 1672, 941, '[]'::jsonb)
    `;
    const scenes = await sql<{ project_id: string | null; name: string }[]>`
      SELECT project_id, name FROM office_scenes
      WHERE company_id = ${companyId}
      ORDER BY project_id NULLS FIRST
    `;
    expect(scenes).toEqual([
      { project_id: null, name: "Existing company layout" },
      { project_id: projectId, name: "Project layout" },
    ]);
  }, 90_000);
});
