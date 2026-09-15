import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICE_REPORT_CRON,
  OFFICE_REPORT_MARKER,
  OFFICE_REPORT_TIMEZONE,
  OFFICE_REPORT_TITLE,
  OfficeReportSetupError,
  buildOfficeActivityPrompt,
  parseArgs,
  setupOfficeReport,
} from "../setup-office-reports.mjs";

const companyId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";
const routineId = "44444444-4444-4444-8444-444444444444";
const triggerId = "55555555-5555-4555-8555-555555555555";
const documentId = "66666666-6666-4666-8666-666666666666";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fixture({ existing = false, projectStatus = 200 } = {}) {
  const prompt = await buildOfficeActivityPrompt({ companyId, projectId });
  const detail = {
    id: routineId,
    companyId,
    projectId,
    title: OFFICE_REPORT_TITLE,
    description: prompt,
    assigneeAgentId: agentId,
    priority: "low",
    status: "active",
    concurrencyPolicy: "skip_if_active",
    catchUpPolicy: "skip_missed",
    descriptionDocument: { id: documentId, body: prompt },
    triggers: existing ? [{
      id: triggerId,
      kind: "schedule",
      label: "Daily 09:00 Asia/Bangkok (enable after manual review)",
      enabled: false,
      cronExpression: OFFICE_REPORT_CRON,
      timezone: OFFICE_REPORT_TIMEZONE,
    }] : [],
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const requestUrl = new URL(url);
    const path = requestUrl.pathname;
    const method = init.method ?? "GET";
    calls.push({ method, path, query: requestUrl.search, body: init.body ? JSON.parse(init.body) : null });
    if (path === `/api/companies/${companyId}`) return json({ id: companyId });
    if (path === `/api/projects/${projectId}`) {
      return projectStatus === 200 ? json({ id: projectId, companyId }) : json({ error: "Project not found" }, projectStatus);
    }
    if (path === `/api/agents/${agentId}`) return json({ id: agentId, companyId, status: "idle" });
    if (path === `/api/companies/${companyId}/routines`) {
      if (method === "GET") return json(existing ? [{ ...detail, triggers: detail.triggers }] : []);
      if (method === "POST") return json({ id: routineId }, 201);
    }
    if (path === `/api/routines/${routineId}` && method === "GET") return json(detail);
    if (path === `/api/routines/${routineId}/triggers` && method === "POST") {
      detail.triggers = [{
        id: triggerId,
        kind: "schedule",
        label: "Daily 09:00 Asia/Bangkok (enable after manual review)",
        enabled: false,
        cronExpression: OFFICE_REPORT_CRON,
        timezone: OFFICE_REPORT_TIMEZONE,
      }];
      return json({ trigger: detail.triggers[0] }, 201);
    }
    return json({ error: `Unexpected ${method} ${path}` }, 500);
  };
  return { fetchImpl, calls, prompt };
}

test("serial setup rerun returns the verified native receipt without creating another routine or trigger", async () => {
  const { fetchImpl, calls, prompt } = await fixture({ existing: true });
  const receipt = await setupOfficeReport({
    baseUrl: "http://127.0.0.1:3100",
    companyId,
    projectId,
    assigneeAgentId: agentId,
  }, { fetchImpl });

  assert.equal(receipt.outcome, "existing");
  assert.equal(receipt.routineId, routineId);
  assert.equal(receipt.routineDescriptionDocumentId, documentId);
  assert.equal(receipt.schedule.enabled, false);
  assert.equal(receipt.manualRunRequiredBeforeScheduleEnable, true);
  assert.match(prompt, new RegExp(`<!-- ${OFFICE_REPORT_MARKER} -->`));
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("first setup creates only the native routine and a disabled daily schedule", async () => {
  const { fetchImpl, calls } = await fixture();
  const receipt = await setupOfficeReport({
    baseUrl: "http://127.0.0.1:3100",
    companyId,
    projectId,
    assigneeAgentId: agentId,
  }, { fetchImpl });

  assert.equal(receipt.outcome, "created");
  assert.deepEqual(receipt.schedule, {
    cronExpression: OFFICE_REPORT_CRON,
    timezone: OFFICE_REPORT_TIMEZONE,
    enabled: false,
  });
  const createRoutine = calls.find((call) => call.method === "POST" && call.path.endsWith("/routines"));
  const createTrigger = calls.find((call) => call.method === "POST" && call.path.endsWith("/triggers"));
  assert.equal(createRoutine.body.projectId, projectId);
  assert.equal(createRoutine.body.assigneeAgentId, agentId);
  assert.equal(createRoutine.body.status, "active");
  assert.equal(createRoutine.body.concurrencyPolicy, "skip_if_active");
  assert.equal(createRoutine.body.catchUpPolicy, "skip_missed");
  assert.deepEqual(createTrigger.body, {
    kind: "schedule",
    label: "Daily 09:00 Asia/Bangkok (enable after manual review)",
    enabled: false,
    cronExpression: OFFICE_REPORT_CRON,
    timezone: OFFICE_REPORT_TIMEZONE,
  });
});

test("missing project input fails before routine creation or schedule mutation", async () => {
  const { fetchImpl, calls } = await fixture({ projectStatus: 404 });
  await assert.rejects(
    () => setupOfficeReport({
      baseUrl: "http://127.0.0.1:3100",
      companyId,
      projectId,
      assigneeAgentId: agentId,
    }, { fetchImpl }),
    (error) => error instanceof OfficeReportSetupError && /Project not found/.test(error.message),
  );
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    `GET /api/companies/${companyId}`,
    `GET /api/projects/${projectId}`,
  ]);
});

test("the canonical prompt requires complete real collections, artifacts, and board review handoff", async () => {
  const prompt = await buildOfficeActivityPrompt({ companyId, projectId });
  assert.match(prompt, /page until a response contains fewer than 100 rows/i);
  assert.match(prompt, /following `nextCursor` until it is `null`/i);
  assert.match(prompt, /do not invent a zero/i);
  assert.match(prompt, /attachment-backed `artifact` work product/i);
  assert.match(prompt, /leave the task in `in_review`/i);
});

test("argument parsing requires explicit scope values", () => {
  assert.throws(
    () => parseArgs(["--base-url", "http://127.0.0.1:3100"]),
    /--company-id must be a UUID/,
  );
});
