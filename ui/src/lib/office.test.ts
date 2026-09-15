import { describe, expect, it } from "vitest";
import type { Agent, HeartbeatRun, Issue, Project } from "@paperclipai/shared";
import type { LiveRunForIssue } from "@/api/heartbeats";
import {
  activeOfficeTasks,
  buildOfficeAgentCards,
  clampOfficeSeat,
  createDefaultOfficeSeats,
  filterOfficeTasks,
  hasDuplicateSeatBinding,
} from "./office";

const companyId = "company-1";
const agentId = "agent-1";
const baseTime = new Date("2026-09-13T12:00:00.000Z");

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: agentId,
    companyId,
    name: "Reviewer",
    role: "reviewer",
    title: "Reviewer",
    adapterType: "codex_local",
    status: "idle",
    lastHeartbeatAt: baseTime,
    ...overrides,
  } as Agent;
}

function makeProject(id: string, name: string): Project {
  return { id, companyId, name } as Project;
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-alpha",
    companyId,
    identifier: "PAP-42",
    title: "Review the release",
    projectId: "project-alpha",
    assigneeAgentId: agentId,
    status: "in_review",
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides,
  } as Issue;
}

function makeLiveRun(overrides: Partial<LiveRunForIssue> = {}): LiveRunForIssue {
  return {
    id: "run-1",
    agentId,
    agentName: "Reviewer",
    adapterType: "codex_local",
    status: "running",
    issueId: "issue-alpha",
    startedAt: "2026-09-13T12:01:00.000Z",
    finishedAt: null,
    createdAt: "2026-09-13T12:01:00.000Z",
    lastEventAt: "2026-09-13T12:02:00.000Z",
    invocationSource: "manual",
    triggerDetail: null,
    ...overrides,
  } as LiveRunForIssue;
}

function makeRun(overrides: Partial<HeartbeatRun> = {}): HeartbeatRun {
  return {
    id: "run-1",
    agentId,
    companyId,
    status: "succeeded",
    startedAt: new Date("2026-09-13T12:01:00.000Z"),
    finishedAt: new Date("2026-09-13T12:03:00.000Z"),
    createdAt: new Date("2026-09-13T12:01:00.000Z"),
    updatedAt: new Date("2026-09-13T12:03:00.000Z"),
    ...overrides,
  } as HeartbeatRun;
}

describe("buildOfficeAgentCards", () => {
  it("keeps lifecycle, terminal run, task workflow, and actual project distinct", () => {
    const issue = makeIssue();
    const cards = buildOfficeAgentCards({
      agents: [makeAgent({ status: "paused" })],
      issues: [issue],
      projects: [makeProject("project-alpha", "Alpha"), makeProject("project-beta", "Beta")],
      // The live endpoint briefly retains "running" after the durable history
      // reports success for the same run. The Office must not regress it.
      liveRuns: [makeLiveRun()],
      recentRuns: [makeRun()],
      selectedProjectId: "project-beta",
    });

    const [card] = cards;
    expect(card?.agent.status).toBe("paused");
    expect(card?.latestRun?.status).toBe("succeeded");
    expect(card?.activeRuns).toEqual([]);
    expect(card?.runIssue?.id).toBe(issue.id);
    expect(card?.runIssue?.status).toBe("in_review");
    expect(card?.runProject?.name).toBe("Alpha");
    expect(card?.isOutsideSelectedProject).toBe(true);
    expect(new Date(card?.lastUpdateAt ?? 0).toISOString()).toBe("2026-09-13T12:03:00.000Z");
  });

  it("labels an assigned task separately when a live run has no task linkage", () => {
    const assignedIssue = makeIssue();
    const cards = buildOfficeAgentCards({
      agents: [makeAgent({ status: "running" })],
      issues: [assignedIssue],
      projects: [makeProject("project-alpha", "Alpha")],
      liveRuns: [makeLiveRun({ id: "run-unlinked", issueId: null })],
      recentRuns: [],
      selectedProjectId: null,
    });

    const [card] = cards;
    expect(card?.latestRun?.id).toBe("run-unlinked");
    expect(card?.latestRun?.status).toBe("running");
    expect(card?.runIssue).toBeNull();
    expect(card?.assignedIssue?.id).toBe(assignedIssue.id);
    expect(card?.assignedProject?.name).toBe("Alpha");
  });

  it("retains a terminal run's native task link after the task is reassigned to the board", () => {
    const issue = makeIssue({ assigneeAgentId: null, status: "in_review" });
    const cards = buildOfficeAgentCards({
      agents: [makeAgent()],
      issues: [issue],
      projects: [makeProject("project-alpha", "Alpha")],
      liveRuns: [],
      recentRuns: [makeRun({ contextSnapshot: { issueId: issue.id } })],
      selectedProjectId: null,
    });

    const [card] = cards;
    expect(card?.latestRun?.status).toBe("succeeded");
    expect(card?.runIssue?.id).toBe(issue.id);
    expect(card?.assignedIssue).toBeNull();
    expect(card?.runProject?.name).toBe("Alpha");
  });
});

describe("Office task scope and seat geometry", () => {
  it("filters task counts by project without removing company cards", () => {
    const alpha = makeIssue();
    const beta = makeIssue({ id: "issue-beta", projectId: "project-beta", status: "todo" });
    const closed = makeIssue({ id: "issue-closed", status: "done" });

    expect(filterOfficeTasks([alpha, beta, closed], "project-alpha").map((issue) => issue.id)).toEqual([
      "issue-alpha",
      "issue-closed",
    ]);
    expect(activeOfficeTasks(filterOfficeTasks([alpha, beta, closed], "project-alpha")).map((issue) => issue.id)).toEqual([
      "issue-alpha",
    ]);
  });

  it("uses saveable UUID seats and clamps an edited rectangle inside the full image", () => {
    const seats = createDefaultOfficeSeats();
    expect(seats).toHaveLength(6);
    expect(seats.every((seat) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seat.id))).toBe(true);

    const bounded = clampOfficeSeat({ ...seats[0]!, x: 0.95, y: -0.1, width: 0.4, height: 0.4 });
    expect(bounded).toMatchObject({ x: 0.6, y: 0, width: 0.4, height: 0.4 });
    expect(hasDuplicateSeatBinding([
      { ...seats[0]!, agentId },
      { ...seats[1]!, agentId },
    ])).toBe(true);
  });
});
