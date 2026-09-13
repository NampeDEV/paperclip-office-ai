import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { OFFICE_SCENE_MAX_SEATS, type Agent } from "@paperclipai/shared";
import { ApiError } from "@/api/client";
import { officeApi, type OfficeScene, type OfficeSeat, type SaveOfficeScene } from "@/api/office";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUNDLED_OFFICE_IMAGE,
  OFFICE_MAX_BACKGROUND_BYTES,
  OFFICE_SCENE_NAME,
  clampOfficeSeat,
  hasDuplicateSeatBinding,
  isAgentAvailableForSeat,
  officeSeatStyle,
  createDefaultOfficeSeats,
  updateOfficeSeat,
} from "@/lib/office";

interface SceneDraft {
  revision: number;
  name: string;
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  seats: OfficeSeat[];
}

interface DragState {
  seatId: string;
  mode: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  initial: OfficeSeat;
}

interface SceneEditorProps {
  companyId: string;
  scene: OfficeScene | null;
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (scene: OfficeScene) => void;
  onReload: () => Promise<OfficeScene | null>;
}

function createDraft(scene: OfficeScene | null): SceneDraft {
  if (scene) {
    return {
      revision: scene.revision,
      name: scene.name,
      backgroundAssetId: scene.backgroundAssetId,
      imageWidth: scene.imageWidth,
      imageHeight: scene.imageHeight,
      seats: scene.seats.map((seat) => ({ ...seat })),
    };
  }
  return {
    revision: 0,
    name: OFFICE_SCENE_NAME,
    backgroundAssetId: null,
    imageWidth: BUNDLED_OFFICE_IMAGE.width,
    imageHeight: BUNDLED_OFFICE_IMAGE.height,
    seats: createDefaultOfficeSeats(),
  };
}

function draftImageSource(assetId: string | null) {
  return assetId
    ? `/api/assets/${encodeURIComponent(assetId)}/content`
    : BUNDLED_OFFICE_IMAGE.src;
}

function roundedSeatValue(value: number): string {
  return value.toFixed(2);
}

export function SceneEditor({
  companyId,
  scene,
  agents,
  open,
  onOpenChange,
  onSaved,
  onReload,
}: SceneEditorProps) {
  const [draft, setDraft] = useState<SceneDraft>(() => createDraft(scene));
  const [preview, setPreview] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(createDraft(scene));
      setPreview(false);
      setSaveError(null);
      setDrag(null);
    }
    wasOpenRef.current = open;
  }, [open, scene]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => officeApi.uploadBackground(companyId, file),
    onSuccess: (uploaded) => {
      setDraft((current) => ({
        ...current,
        backgroundAssetId: uploaded.assetId,
        imageWidth: uploaded.imageWidth,
        imageHeight: uploaded.imageHeight,
      }));
      setPreview(false);
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "Could not upload the scene image.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (next: SaveOfficeScene) => officeApi.saveScene(companyId, next),
    onSuccess: (saved) => {
      saveLockRef.current = false;
      setSaveError(null);
      onSaved(saved);
      onOpenChange(false);
    },
    onError: (error) => {
      saveLockRef.current = false;
      if (error instanceof ApiError && error.status === 409) {
        setSaveError("This scene changed elsewhere. Reload it before saving your layout.");
        return;
      }
      setSaveError(error instanceof Error ? error.message : "Could not save the scene.");
    },
  });

  function updateDraftSeat(seatId: string, changes: Partial<OfficeSeat>) {
    setDraft((current) => ({
      ...current,
      seats: current.seats.map((seat) => seat.id === seatId ? updateOfficeSeat(seat, changes) : seat),
    }));
  }

  function addSeat() {
    setDraft((current) => {
      if (current.seats.length >= OFFICE_SCENE_MAX_SEATS) return current;
      const highestZIndex = Math.max(0, ...current.seats.map((seat) => seat.zIndex));
      return {
        ...current,
        seats: [
          ...current.seats,
          {
            id: crypto.randomUUID(),
            label: `Seat ${current.seats.length + 1}`,
            agentId: null,
            // New seats begin in a bounded, visible area. Their precise desk
            // placement is intentionally chosen with the editor controls.
            x: 0.38,
            y: 0.52,
            width: 0.24,
            height: 0.19,
            zIndex: Math.min(1_000, highestZIndex + 1),
          },
        ],
      };
    });
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > OFFICE_MAX_BACKGROUND_BYTES) {
      setSaveError("Choose an image smaller than 5 MiB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setSaveError("Choose a raster image file.");
      return;
    }
    setSaveError(null);
    uploadMutation.mutate(file);
  }

  function startDrag(event: PointerEvent<HTMLElement>, seat: OfficeSeat, mode: DragState["mode"]) {
    if (preview || event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture(event.pointerId);
    setDrag({
      seatId: seat.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initial: seat,
    });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const deltaX = (event.clientX - drag.startX) / rect.width;
    const deltaY = (event.clientY - drag.startY) / rect.height;
    if (drag.mode === "move") {
      updateDraftSeat(drag.seatId, { x: drag.initial.x + deltaX, y: drag.initial.y + deltaY });
      return;
    }
    updateDraftSeat(drag.seatId, {
      width: drag.initial.width + deltaX,
      height: drag.initial.height + deltaY,
    });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }

  async function reloadDraft() {
    try {
      const reloaded = await onReload();
      setDraft(createDraft(reloaded));
      setSaveError(null);
      setPreview(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not reload the scene.");
    }
  }

  function saveDraft() {
    if (saveLockRef.current || uploadMutation.isPending || saveMutation.isPending) return;
    const seats = draft.seats.map(clampOfficeSeat);
    if (hasDuplicateSeatBinding(seats)) {
      setSaveError("An agent can only be assigned to one seat.");
      return;
    }
    setSaveError(null);
    saveLockRef.current = true;
    saveMutation.mutate({
      revision: draft.revision,
      name: draft.name.trim() || OFFICE_SCENE_NAME,
      backgroundAssetId: draft.backgroundAssetId,
      imageWidth: draft.imageWidth,
      imageHeight: draft.imageHeight,
      seats,
    });
  }

  const stageStyle = { aspectRatio: `${draft.imageWidth} / ${draft.imageHeight}` } as CSSProperties;
  const pending = uploadMutation.isPending || saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !pending ? onOpenChange(false) : null)}>
      <DialogContent className="flex max-h-(--sz-85vh) w-full max-w-6xl flex-col overflow-hidden" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Scene editor</DialogTitle>
          <DialogDescription>
            Positions are normalized to the full image. Drag in this editor or use the numeric fields below.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="office-scene-name">Scene name</Label>
                <Input
                  id="office-scene-name"
                  className="min-h-(--sz-44px)"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-scene-image">Background image</Label>
                <Input
                  id="office-scene-image"
                  className="min-h-(--sz-44px)"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleUpload}
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  {draft.backgroundAssetId ? "Uploaded image preview" : "Bundled office art"} · {draft.imageWidth} × {draft.imageHeight}
                </p>
              </div>
            </div>

            <div
              ref={stageRef}
              className="office-editor-stage"
              style={stageStyle}
              data-preview={preview || undefined}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img src={draftImageSource(draft.backgroundAssetId)} alt="Scene layout preview" className="absolute inset-0 h-full w-full object-contain" />
              {draft.seats.map((seat) => (
                <div
                  key={seat.id}
                  className="office-editor-seat"
                  style={officeSeatStyle(seat)}
                  onPointerDown={(event) => startDrag(event, seat, "move")}
                >
                  <span className="truncate">{seat.label}</span>
                  <span className="office-editor-seat-agent truncate">
                    {seat.agentId ? agents.find((agent) => agent.id === seat.agentId)?.name ?? "Unavailable agent" : "Unassigned"}
                  </span>
                  {!preview ? (
                    <button
                      type="button"
                      data-office-resize
                      aria-label={`Resize ${seat.label}`}
                      className="office-editor-resize"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startDrag(event, seat, "resize");
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Seats</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-(--sz-44px)"
                    onClick={addSeat}
                    disabled={preview || draft.seats.length >= OFFICE_SCENE_MAX_SEATS}
                  >
                    Add seat
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="min-h-(--sz-44px)" onClick={() => setPreview((current) => !current)}>
                    {preview ? "Edit layout" : "Preview"}
                  </Button>
                </div>
              </div>
              {draft.seats.map((seat) => (
                <fieldset key={seat.id} className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-medium">{seat.label}</legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span>Label</span>
                      <Input className="min-h-(--sz-44px)" value={seat.label} onChange={(event) => updateDraftSeat(seat.id, { label: event.target.value })} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Agent</span>
                      <select
                        className="min-h-(--sz-44px) w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                        value={seat.agentId ?? ""}
                        onChange={(event) => updateDraftSeat(seat.id, { agentId: event.target.value || null })}
                      >
                        <option value="">Unassigned</option>
                        {agents.map((agent) => (
                          <option
                            key={agent.id}
                            value={agent.id}
                            disabled={!isAgentAvailableForSeat(draft.seats, agent.id, seat.id)}
                          >
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["x", "y", "width", "height"] as const).map((field) => (
                      <label key={field} className="space-y-1 text-sm">
                        <span>{field}</span>
                        <Input
                          className="min-h-(--sz-44px)"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={roundedSeatValue(seat[field])}
                          onChange={(event) => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(value)) updateDraftSeat(seat.id, { [field]: value });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        </div>

        {saveError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <p>{saveError}</p>
            {saveError.includes("changed elsewhere") ? (
              <Button type="button" variant="outline" size="sm" className="mt-2 min-h-(--sz-44px)" onClick={() => void reloadDraft()} disabled={pending}>
                Reload scene
              </Button>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-(--sz-44px)" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" className="min-h-(--sz-44px)" onClick={saveDraft} disabled={pending}>
            {saveMutation.isPending ? "Saving…" : uploadMutation.isPending ? "Uploading…" : "Save layout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
