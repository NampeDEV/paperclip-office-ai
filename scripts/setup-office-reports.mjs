import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const promptPath = path.join(root, "doc", "office", "prompt-library", "office-activity-report.md");

export const OFFICE_REPORT_MARKER = "paperclip-office:daily-activity-report:v1";
export const OFFICE_REPORT_TITLE = "Daily Office activity report";
export const OFFICE_REPORT_CRON = "0 9 * * *";
export const OFFICE_REPORT_TIMEZONE = "Asia/Bangkok";
export const OFFICE_REPORT_TRIGGER_LABEL = "Daily 09:00 Asia/Bangkok (enable after manual review)";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OfficeReportSetupError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "OfficeReportSetupError";
  }
}

function requireGuid(name, value) {
  if (typeof value !== "string" || !GUID_RE.test(value)) {
    throw new OfficeReportSetupError(`${name} must be a UUID.`);
  }
  return value;
}

export function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new OfficeReportSetupError("--base-url must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OfficeReportSetupError("--base-url must use HTTP or HTTPS.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api$/i, "") || "/";
  return url.toString().replace(/\/$/, "");
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (!arg.startsWith("--")) throw new OfficeReportSetupError(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (![
      "base-url",
      "company-id",
      "project-id",
      "assignee-agent-id",
    ].includes(key)) {
      throw new OfficeReportSetupError(`Unknown option: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new OfficeReportSetupError(`${arg} requires a value.`);
    if (values[key] !== undefined) throw new OfficeReportSetupError(`${arg} may only be provided once.`);
    values[key] = value;
    index += 1;
  }
  return {
    baseUrl: normalizeBaseUrl(values["base-url"]),
    companyId: requireGuid("--company-id", values["company-id"]),
    projectId: requireGuid("--project-id", values["project-id"]),
    assigneeAgentId: requireGuid("--assignee-agent-id", values["assignee-agent-id"]),
  };
}

export function usage() {
  return [
    "Usage:",
    "  node scripts/setup-office-reports.mjs --base-url URL --company-id UUID --project-id UUID --assignee-agent-id UUID",
    "",
    "Creates or verifies the disabled native Daily Office activity report routine.",
    "It never invokes the routine or enables its schedule.",
  ].join("\n");
}

function apiUrl(baseUrl, pathname, query) {
  const url = new URL(`/api/${pathname.replace(/^\/+/, "")}`, `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function safeBodyText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").slice(0, 500) : "";
}

export async function requestJson(fetchImpl, baseUrl, method, pathname, options = {}) {
  let response;
  try {
    response = await fetchImpl(apiUrl(baseUrl, pathname, options.query), {
      method,
      headers: options.body === undefined ? { Accept: "application/json" } : {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new OfficeReportSetupError(
      `${method} /api/${pathname} failed before a response: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail = typeof payload === "object" && payload && "error" in payload
      ? String(payload.error)
      : safeBodyText(text);
    throw new OfficeReportSetupError(`${method} /api/${pathname} failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return payload;
}

export async function buildOfficeActivityPrompt({ companyId, projectId }) {
  const template = (await readFile(promptPath, "utf8")).replace(/\r\n/g, "\n");
  const replacements = {
    ROUTINE_MARKER: OFFICE_REPORT_MARKER,
    COMPANY_ID: companyId,
    PROJECT_ID: projectId,
  };
  const prompt = template.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key) => {
    if (!(key in replacements)) throw new OfficeReportSetupError(`Unknown prompt placeholder: ${placeholder}`);
    return replacements[key];
  });
  if (/\{\{[A-Z_]+\}\}/.test(prompt)) throw new OfficeReportSetupError("Prompt contains an unresolved placeholder.");
  return prompt;
}

export function promptSha256(prompt) {
  return createHash("sha256").update(prompt).digest("hex");
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OfficeReportSetupError(`${name} returned an invalid response.`);
  }
  return value;
}

function assertScopedResource(value, name, id, companyId) {
  const resource = assertObject(value, name);
  if (resource.id !== id) throw new OfficeReportSetupError(`${name} ID did not match the requested ID.`);
  if (resource.companyId !== companyId) throw new OfficeReportSetupError(`${name} does not belong to the requested company.`);
  return resource;
}

function matchingRoutines(rows) {
  if (!Array.isArray(rows)) throw new OfficeReportSetupError("Routine lookup returned an invalid response.");
  return rows.filter((routine) =>
    routine &&
    typeof routine === "object" &&
    typeof routine.description === "string" &&
    routine.description.includes(`<!-- ${OFFICE_REPORT_MARKER} -->`),
  );
}

function assertRoutineMatches(routine, input, prompt) {
  if (typeof routine.id !== "string") {
    throw new OfficeReportSetupError("Existing Office report routine is missing its ID.");
  }
  const fields = [
    ["title", OFFICE_REPORT_TITLE],
    ["companyId", input.companyId],
    ["projectId", input.projectId],
    ["assigneeAgentId", input.assigneeAgentId],
    ["status", "active"],
    ["priority", "low"],
    ["concurrencyPolicy", "skip_if_active"],
    ["catchUpPolicy", "skip_missed"],
    ["description", prompt],
  ];
  for (const [field, expected] of fields) {
    if (routine[field] !== expected) {
      throw new OfficeReportSetupError(`Existing Office report routine has unexpected ${field}; review it instead of overwriting it.`);
    }
  }
  if (
    !routine.descriptionDocument ||
    typeof routine.descriptionDocument.id !== "string" ||
    routine.descriptionDocument.body !== prompt
  ) {
    throw new OfficeReportSetupError("Existing Office report routine is missing its matching native description document.");
  }
}

function matchingScheduleTriggers(routine) {
  if (!Array.isArray(routine.triggers)) throw new OfficeReportSetupError("Routine detail is missing triggers.");
  return routine.triggers.filter((trigger) =>
    trigger &&
    trigger.kind === "schedule" &&
    trigger.cronExpression === OFFICE_REPORT_CRON &&
    trigger.timezone === OFFICE_REPORT_TIMEZONE,
  );
}

async function getRoutineDetail(fetchImpl, baseUrl, routineId) {
  const detail = await requestJson(fetchImpl, baseUrl, "GET", `routines/${routineId}`);
  return assertObject(detail, "Routine detail");
}

async function findCreatedRoutine(fetchImpl, baseUrl, companyId, input, prompt) {
  const rows = await requestJson(fetchImpl, baseUrl, "GET", `companies/${companyId}/routines`);
  const matches = matchingRoutines(rows);
  if (matches.length !== 1) return null;
  const candidate = matches[0];
  if (typeof candidate.id !== "string") return null;
  if (candidate.projectId !== input.projectId || candidate.assigneeAgentId !== input.assigneeAgentId) return null;
  const detail = await getRoutineDetail(fetchImpl, baseUrl, candidate.id);
  assertRoutineMatches(detail, input, prompt);
  return detail;
}

export async function setupOfficeReport(input, { fetchImpl = fetch } = {}) {
  const normalized = {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    companyId: requireGuid("companyId", input.companyId),
    projectId: requireGuid("projectId", input.projectId),
    assigneeAgentId: requireGuid("assigneeAgentId", input.assigneeAgentId),
  };
  const prompt = await buildOfficeActivityPrompt(normalized);
  const promptHash = promptSha256(prompt);

  const company = await requestJson(fetchImpl, normalized.baseUrl, "GET", `companies/${normalized.companyId}`);
  assertObject(company, "Company");
  if (company.id !== normalized.companyId) throw new OfficeReportSetupError("Company ID did not match the requested company.");
  const project = await requestJson(fetchImpl, normalized.baseUrl, "GET", `projects/${normalized.projectId}`);
  assertScopedResource(project, "Project", normalized.projectId, normalized.companyId);
  const agent = await requestJson(fetchImpl, normalized.baseUrl, "GET", `agents/${normalized.assigneeAgentId}`);
  assertScopedResource(agent, "Assignee agent", normalized.assigneeAgentId, normalized.companyId);

  const routines = await requestJson(fetchImpl, normalized.baseUrl, "GET", `companies/${normalized.companyId}/routines`);
  const matches = matchingRoutines(routines);
  if (matches.length > 1) {
    throw new OfficeReportSetupError("Multiple Office report routines carry the ownership marker; resolve the duplicate before rerunning setup.");
  }

  let outcome = "existing";
  let detail;
  if (matches.length === 1) {
    detail = await getRoutineDetail(fetchImpl, normalized.baseUrl, matches[0].id);
    assertRoutineMatches(detail, normalized, prompt);
  } else {
    outcome = "created";
    try {
      const created = await requestJson(fetchImpl, normalized.baseUrl, "POST", `companies/${normalized.companyId}/routines`, {
        body: {
          projectId: normalized.projectId,
          title: OFFICE_REPORT_TITLE,
          description: prompt,
          assigneeAgentId: normalized.assigneeAgentId,
          priority: "low",
          status: "active",
          concurrencyPolicy: "skip_if_active",
          catchUpPolicy: "skip_missed",
          variables: [],
        },
      });
      if (!created || typeof created.id !== "string") {
        throw new OfficeReportSetupError("Routine creation returned no routine ID.");
      }
      detail = await getRoutineDetail(fetchImpl, normalized.baseUrl, created.id);
      assertRoutineMatches(detail, normalized, prompt);
    } catch (error) {
      const recovered = await findCreatedRoutine(
        fetchImpl,
        normalized.baseUrl,
        normalized.companyId,
        normalized,
        prompt,
      ).catch(() => null);
      if (!recovered) throw error;
      outcome = "recovered_after_create_error";
      detail = recovered;
    }
  }

  let triggers = matchingScheduleTriggers(detail);
  if (triggers.length > 1) {
    throw new OfficeReportSetupError("Multiple matching Office report schedules exist; resolve the duplicate before rerunning setup.");
  }
  if (triggers.length === 0) {
    const created = await requestJson(fetchImpl, normalized.baseUrl, "POST", `routines/${detail.id}/triggers`, {
      body: {
        kind: "schedule",
        label: OFFICE_REPORT_TRIGGER_LABEL,
        enabled: false,
        cronExpression: OFFICE_REPORT_CRON,
        timezone: OFFICE_REPORT_TIMEZONE,
      },
    });
    if (!created || !created.trigger) throw new OfficeReportSetupError("Schedule creation returned no trigger.");
    detail = await getRoutineDetail(fetchImpl, normalized.baseUrl, detail.id);
    triggers = matchingScheduleTriggers(detail);
  }
  if (triggers.length !== 1) throw new OfficeReportSetupError("Office report schedule could not be verified.");
  const trigger = triggers[0];
  if (
    typeof trigger.id !== "string" ||
    trigger.label !== OFFICE_REPORT_TRIGGER_LABEL ||
    trigger.enabled !== false
  ) {
    throw new OfficeReportSetupError("Office report schedule is not the required disabled 09:00 Asia/Bangkok schedule; review it instead of overwriting it.");
  }

  return {
    kind: "paperclip_office_report_setup_receipt",
    outcome,
    routineId: detail.id,
    routineDescriptionDocumentId: detail.descriptionDocument.id,
    scheduleTriggerId: trigger.id,
    schedule: {
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      enabled: trigger.enabled,
    },
    companyId: normalized.companyId,
    projectId: normalized.projectId,
    assigneeAgentId: normalized.assigneeAgentId,
    promptSha256: promptHash,
    manualRunRequiredBeforeScheduleEnable: true,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const receipt = await setupOfficeReport(args);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
