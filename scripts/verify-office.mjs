import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

// Live acceptance check for the isolated local verification company.
const base = process.env.OFFICE_BASE_URL ?? "http://127.0.0.1:3100";
const root = process.cwd();
const company = JSON.parse(await readFile(path.join(root, ".paperclip-local/company.json"), "utf8"));
const agents = JSON.parse(await readFile(path.join(root, ".paperclip-local/agents.json"), "utf8"));
const evidenceDir = path.join(root, ".paperclip-local/qa");
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "dark" });
await context.addInitScript(() => localStorage.setItem("paperclip.theme", "dark"));
const page = await context.newPage();
page.setDefaultNavigationTimeout(120000);
const errors = [];
const evidence = { checkedAt: new Date().toISOString(), checks: [], screenshots: [] };
let layoutToRestore = null;
page.on("pageerror", (error) => errors.push(error.message));
const apiPath = `/api/companies/${company.id}/office-scene`;
const getScene = async () => {
  const response = await context.request.get(`${base}${apiPath}`);
  assert.equal(response.status(), 200);
  return response.json();
};
try {
  await page.goto(`${base}/${company.issuePrefix}/office`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("heading", { name: "AI Office", exact: true }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Background image", { exact: true }).setInputFiles(path.join(root, "ui/public/office/office-night.webp"));
  await editor.getByText(/Uploaded image preview/).waitFor();
  for (let index = 0; index < 3; index += 1) {
    await editor.locator("fieldset").nth(index).getByRole("combobox").selectOption(agents[index].id);
    await editor.locator("fieldset").nth(index).getByLabel("height", { exact: true }).fill("0.19");
  }
  await editor.locator("fieldset").first().getByLabel("x", { exact: true }).fill("0.08");
  await editor.getByRole("button", { name: "Preview", exact: true }).click();
  await editor.locator("[data-preview]").waitFor();
  assert.equal(await editor.locator("[data-preview]").count(), 1);
  await editor.getByRole("button", { name: "Save layout", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const saved = await getScene();
  assert.equal(saved.seats.filter((seat) => seat.agentId).length, 3);
  assert.equal(saved.seats[0].x, 0.08);
  assert.equal(saved.imageWidth, 1672);
  assert.equal(saved.imageHeight, 941);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".office-seat [data-testid]").first().waitFor();
  assert.deepEqual(await getScene(), saved);
  evidence.checks.push("Uploaded raster, assigned three agents, edited normalized x, previewed, saved and reloaded exact scene");

  const payload = { projectId: null, characters: saved.characters, revision: saved.revision, name: saved.name, backgroundAssetId: saved.backgroundAssetId,
    imageWidth: saved.imageWidth, imageHeight: saved.imageHeight, seats: saved.seats };
  const race = await Promise.all([1, 2].map(() => context.request.put(`${base}${apiPath}`, { data: payload })));
  assert.deepEqual(race.map((response) => response.status()).sort(), [200, 409]);
  evidence.checks.push("Concurrent writes using the same revision returned one 200 and one 409");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  await editor.getByLabel("Scene name", { exact: true }).fill("Unsaved acceptance draft");
  const current = await getScene();
  const remote = await context.request.put(`${base}${apiPath}`, { data: { ...payload, revision: current.revision } });
  assert.equal(remote.status(), 200);
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await editor.getByRole("alert").getByText(/changed elsewhere/).waitFor();
  assert.equal(await editor.getByLabel("Scene name", { exact: true }).inputValue(), "Unsaved acceptance draft");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  evidence.checks.push("Remote save rejects stale editor revision and preserves unsaved draft");

  const projectsResponse = await context.request.get(`${base}/api/companies/${company.id}/projects`);
  const projects = await projectsResponse.json();
  let emptyProject = projects.find((project) => project.name === "Office scope acceptance");
  if (!emptyProject) {
    const created = await context.request.post(`${base}/api/companies/${company.id}/projects`, { data: { name: "Office scope acceptance", status: "planned" } });
    assert.ok(created.ok(), await created.text());
    emptyProject = await created.json();
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Project scope", { exact: true }).selectOption(emptyProject.id);
  await page.getByText("No active tasks in this scope.").waitFor();
  const companyBeforeProjectEdit = await getScene();
  const projectSceneUrl = `${base}${apiPath}?projectId=${emptyProject.id}`;
  const projectBefore = await (await context.request.get(projectSceneUrl)).json();
  const projectRevision = projectBefore?.projectId === emptyProject.id ? projectBefore.revision : 0;
  if (projectRevision === 0) await page.getByText("Using the company layout. Editing creates a project layout.").waitFor();
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  await editor.getByLabel("Character art", { exact: true }).setInputFiles(path.join(root, "ui/public/office/office-night.webp"));
  await editor.getByText("Character layers", { exact: true }).waitFor();
  await editor.getByRole("button", { name: "Save layout", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const projectSaved = await (await context.request.get(projectSceneUrl)).json();
  assert.equal(projectSaved.projectId, emptyProject.id);
  assert.equal(projectSaved.revision, projectRevision + 1);
  assert.equal(projectSaved.characters.length, (projectRevision ? projectBefore.characters.length : companyBeforeProjectEdit.characters.length) + 1);
  assert.deepEqual(await getScene(), companyBeforeProjectEdit);
  const projectPayload = { ...payload, projectId: emptyProject.id, revision: projectSaved.revision,
    seats: projectSaved.seats, characters: projectSaved.characters };
  const projectRace = await Promise.all([1, 2].map(() => context.request.put(`${base}${apiPath}`, { data: projectPayload })));
  assert.deepEqual(projectRace.map(response => response.status()).sort(), [200, 409]);
  const cleanProject = await context.request.put(`${base}${apiPath}`, { data: {
    ...projectPayload, revision: projectSaved.revision + 1, characters: projectBefore.characters,
  } });
  assert.equal(cleanProject.status(), 200);
  assert.deepEqual(await getScene(), companyBeforeProjectEdit);
  assert.deepEqual(await (await context.request.get(`${base}/api/companies/${company.id}/live-runs`)).json(), []);
  evidence.checks.push("Project fallback, independent character upload, project CAS and unchanged company layout; scene edits created no live runs");
  await page.locator(".office-seat").getByTestId(`office-agent-${agents[1].id}`).click();
  await page.getByRole("tab", { name: "Discussion", exact: true }).click();
  assert.equal(await page.getByRole("tabpanel").getByText("Verify AI Office with one real Codex task", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  await page.getByLabel("Project scope", { exact: true }).selectOption("");
  evidence.checks.push("Empty project filters tasks/discussion while agent keeps its actual task/project label");

  // Controlled HTTP failures exercise pending/error behavior without starting work.
  await page.locator(".office-seat").getByTestId(`office-agent-${agents[0].id}`).click();
  let invocationRequests = 0;
  const invokePattern = `**/agents/${agents[0].id}/heartbeat/invoke**`;
  await page.route(invokePattern, async (route) => {
    invocationRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Acceptance permission denial" }) });
  });
  await page.getByRole("button", { name: "Run agent now", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await page.getByRole("alert").getByText(/Acceptance permission denial/).waitFor();
  assert.equal(invocationRequests, 1);
  await page.unroute(invokePattern);
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  evidence.checks.push("Controlled 403: two immediate clicks send one invocation and show error without success");

  const beforeUnseated = await getScene();
  layoutToRestore = { ...payload, seats: beforeUnseated.seats };
  const fewerSeats = await context.request.put(`${base}${apiPath}`, { data: { ...payload, revision: beforeUnseated.revision, seats: beforeUnseated.seats.slice(0, 2) } });
  assert.equal(fewerSeats.status(), 200);
  await page.reload({ waitUntil: "domcontentloaded" });
  const unseated = page.getByRole("region", { name: "Unseated agents" }).getByTestId(`office-agent-${agents[2].id}`);
  await unseated.waitFor();
  await unseated.click();
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  const restoreScene = await context.request.put(`${base}${apiPath}`, { data: { ...payload, revision: (await getScene()).revision } });
  assert.equal(restoreScene.status(), 200);
  layoutToRestore = null;
  evidence.checks.push("Three real agents with two seats keep the third agent accessible in Unseated agents; restored six seats");

  const companies = await (await context.request.get(`${base}/api/companies`)).json();
  let otherCompany = companies.find((item) => item.name === "Office boundary acceptance");
  if (!otherCompany) {
    const created = await context.request.post(`${base}/api/companies`, { data: { name: "Office boundary acceptance" } });
    assert.ok(created.ok(), await created.text());
    otherCompany = await created.json();
  }
  const foreignSave = await context.request.put(`${base}/api/companies/${otherCompany.id}/office-scene`, { data: { ...payload, revision: 0 } });
  assert.equal(foreignSave.status(), 422);
  const foreignProjectRead = await context.request.get(`${base}/api/companies/${otherCompany.id}/office-scene?projectId=${emptyProject.id}`);
  assert.equal(foreignProjectRead.status(), 422);
  await page.goto(`${base}/${otherCompany.issuePrefix}/office`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "AI Office", exact: true }).waitFor();
  assert.equal(await page.locator('[data-testid^="office-agent-"]').count(), 0);
  await page.goto(`${base}/${company.issuePrefix}/office`, { waitUntil: "domcontentloaded" });
  await page.locator(".office-seat [data-testid]").first().waitFor();
  evidence.checks.push("Second company rejects first-company references and displays no first-company agents after navigation");

  const workload = page.getByRole("region", { name: "Office workload" });
  await workload.waitFor();
  const nativeTasks = await (await context.request.get(`${base}/api/companies/${company.id}/issues`)).json();
  for (const agent of agents) {
    const assigned = nativeTasks.filter(task => task.companyId === company.id && task.assigneeAgentId === agent.id && !["done", "cancelled"].includes(task.status));
    const row = workload.getByRole("row").filter({ has: page.getByRole("rowheader", { name: agent.name, exact: true }) });
    assert.deepEqual(await row.getByRole("cell").allTextContents(), [assigned.length,
      assigned.filter(task => task.status === "blocked").length,
      assigned.filter(task => task.status === "in_review").length, 0, 0].map(String));
  }
  evidence.checks.push("Workload rows reconcile against native company task assignments and zero live runs");

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "AI Office", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `overflow ${viewport.width}`);
    if (viewport.width === 390) {
      assert.equal(await page.locator(".office-mobile-agent-list").isVisible(), true);
      await page.getByRole("button", { name: "Show scene overview", exact: true }).click();
      await page.locator(".office-scene").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Hide scene overview", exact: true }).click();
      const card = page.locator(".office-mobile-agent-list [data-testid]").first();
      assert.ok((await card.boundingBox()).height >= 44);
      await card.click();
      await page.getByRole("dialog").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.getByRole("button", { name: /Close inspector/i }).click();
    }
    const screenshot = `office-${viewport.width}.png`;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
    evidence.screenshots.push(screenshot);
    evidence.checks.push(`Viewport ${viewport.width}x${viewport.height}: no horizontal overflow`);
  }
  assert.deepEqual(errors, []);
  evidence.checks.push("No browser page errors");
  console.log(JSON.stringify(evidence));
} finally {
  if (layoutToRestore) {
    const response = await context.request.put(`${base}${apiPath}`, { data: { ...layoutToRestore, revision: (await getScene()).revision } });
    assert.equal(response.status(), 200, "Restore the six-seat layout after an interrupted acceptance check");
  }
  await page.screenshot({ path: path.join(evidenceDir, "office-check-last.png"), fullPage: true }).catch(() => {});
  await writeFile(path.join(evidenceDir, "browser-evidence.json"), JSON.stringify({ ...evidence, errors }, null, 2));
  await browser.close();
}
