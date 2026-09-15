import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = process.env.OFFICE_BASE_URL ?? "http://127.0.0.1:3100";
async function api(path, body) {
  const response = await fetch(`${base}/api${path}`, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(data)}`);
  return data;
}
const name = "Office team acceptance";
const companies = await api("/companies");
const company = companies.find(item => item.name === name) ?? await api("/companies", { name });
const path = `/companies/${company.id}`;
const installPath = `${path}/teams/catalog/planner-executor-reviewer`;
const body = {
  idempotencyKey: "office-team-acceptance-2026-09-13-v1",
  include: { agents: true, projects: true, issues: true, skills: true }, collisionStrategy: "skip",
  adapterOverrides: Object.fromEntries(["planner", "executor", "reviewer"].map(slug => [slug, { adapterType: "codex_local" }])),
};
const preview = await api(`${installPath}/preview`, { include: body.include, collisionStrategy: body.collisionStrategy });
assert.equal(preview.team.counts.agents, 3);
assert.equal(preview.team.counts.projects, 1);
assert.equal(preview.team.counts.tasks, 0);
assert.equal(preview.team.counts.routines, 0);
const first = await api(`${installPath}/install`, body);
const replay = await api(`${installPath}/install`, body);
assert.deepEqual(replay, first);
const changed = await fetch(`${base}/api${installPath}/install`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...body, collisionStrategy: "rename" }),
});
assert.equal(changed.status, 409);
const agents = await api(`${path}/agents`);
const projects = await api(`${path}/projects`);
assert.equal(agents.length, 3);
assert.deepEqual(agents.map(agent => agent.name).sort(), ["Executor", "Planner", "Reviewer"]);
assert.equal(projects.length, 1);
assert.deepEqual(await api(`${path}/issues`), []);
assert.deepEqual(await api(`${path}/live-runs`), []);
const receipt = { checkedAt: new Date().toISOString(), companyId: company.id,
  checks: ["preview: three agents, one project, no tasks or routines", "same key returns identical receipt", "changed input returns 409", "exactly three agents and one project after replay", "no tasks or live runs"],
  receipt: first };
await writeFile(".paperclip-local/qa/team-evidence.json", JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ ...receipt, receipt: undefined }));
