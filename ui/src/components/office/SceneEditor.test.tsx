// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfficeScene } from "@/api/office";
import { createDefaultOfficeSeats } from "@/lib/office";

const mutationState = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: mutationState.mutate, isPending: false }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { SceneEditor } from "./SceneEditor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function scene(name: string, revision: number): OfficeScene {
  return {
    id: "scene-1",
    companyId: "company-1",
    projectId: null,
    name,
    backgroundAssetId: null,
    imageWidth: 1672,
    imageHeight: 941,
    isActive: true,
    revision,
    seats: createDefaultOfficeSeats(),
    characters: [],
    createdAt: new Date("2026-09-13T12:00:00.000Z"),
    updatedAt: new Date("2026-09-13T12:00:00.000Z"),
  };
}

describe("SceneEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("keeps an open unsaved draft when a scene refetch changes the prop", () => {
    const onOpenChange = vi.fn();
    const render = (nextScene: OfficeScene) => {
      act(() => {
        root.render(
          <SceneEditor
            companyId="company-1"
            projectId={null}
            scene={nextScene}
            agents={[]}
            open
            onOpenChange={onOpenChange}
            onSaved={vi.fn()}
            onReload={async () => null}
          />,
        );
      });
    };

    render(scene("Saved scene", 1));
    const nameInput = container.querySelector("#office-scene-name") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Unsaved local layout");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(nameInput.value).toBe("Unsaved local layout");

    render(scene("Remote replacement", 2));
    expect((container.querySelector("#office-scene-name") as HTMLInputElement).value).toBe("Unsaved local layout");
  });

  it("does not start two saves from same-tick clicks", () => {
    act(() => {
      root.render(
        <SceneEditor
          companyId="company-1"
          projectId={null}
          scene={scene("Saved scene", 1)}
          agents={[]}
          open
          onOpenChange={vi.fn()}
          onSaved={vi.fn()}
          onReload={async () => null}
        />,
      );
    });
    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save layout") as HTMLButtonElement;

    act(() => {
      saveButton.click();
      saveButton.click();
    });

    expect(mutationState.mutate).toHaveBeenCalledTimes(1);
  });

  it("creates a project override from a company fallback instead of updating the fallback", () => {
    act(() => {
      root.render(
        <SceneEditor
          companyId="company-1"
          projectId="11111111-1111-4111-8111-111111111111"
          scene={scene("Company layout", 3)}
          agents={[]}
          open
          onOpenChange={vi.fn()}
          onSaved={vi.fn()}
          onReload={async () => null}
        />,
      );
    });
    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save layout") as HTMLButtonElement;
    act(() => saveButton.click());

    expect(mutationState.mutate).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "11111111-1111-4111-8111-111111111111",
      revision: 0,
      characters: [],
    }));
  });

  it("adds a new editable seat with a browser UUID", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
    act(() => {
      root.render(
        <SceneEditor
          companyId="company-1"
          projectId={null}
          scene={scene("Saved scene", 1)}
          agents={[]}
          open
          onOpenChange={vi.fn()}
          onSaved={vi.fn()}
          onReload={async () => null}
        />,
      );
    });

    const addButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Add seat") as HTMLButtonElement;
    act(() => addButton.click());

    expect(randomUuid).toHaveBeenCalledOnce();
    expect(Array.from(container.querySelectorAll("legend")).map((legend) => legend.textContent)).toContain("Seat 7");
  });
});
