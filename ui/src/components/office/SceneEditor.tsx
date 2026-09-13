import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  OFFICE_SCENE_MAX_CHARACTERS,
  OFFICE_SCENE_MAX_SEATS,
  type Agent,
} from "@paperclipai/shared";
import { ApiError } from "@/api/client";
import {
  officeApi,
  type OfficeCharacter,
  type OfficeScene,
  type OfficeSeat,
  type SaveOfficeScene,
} from "@/api/office";
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
  clampOfficeCharacter,
  clampOfficeSeat,
  hasDuplicateSeatBinding,
  isAgentAvailableForSeat,
  officeCharacterStyle,
  officeSeatStyle,
  createDefaultOfficeSeats,
  updateOfficeSeat,
  updateOfficeCharacter,
} from "@/lib/office";

interface SceneDraft {
  projectId: string | null;
  revision: number;
  name: string;
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  seats: OfficeSeat[];
  characters: OfficeCharacter[];
}

interface DragState {
  layer: "seat" | "character";
  layerId: string;
  mode: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  initial: Pick<OfficeSeat, "x" | "y" | "width" | "height">;
}

interface SceneEditorProps {
  companyId: string;
  /** Requested scope, which can be a project even when the API returned its fallback. */
  projectId: string | null;
  scene: OfficeScene | null;
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (scene: OfficeScene) => void;
  onReload: () => Promise<OfficeScene | null>;
}

function createDraft(scene: OfficeScene | null, projectId: string | null): SceneDraft {
  if (scene) {
    return {
      // A fallback scene stays read-only for a project request. Saving starts a
      // new project override instead of mutating the company layout.
      projectId,
      revision: scene.projectId === projectId ? scene.revision : 0,
      name: scene.name,
      backgroundAssetId: scene.backgroundAssetId,
      imageWidth: scene.imageWidth,
      imageHeight: scene.imageHeight,
      seats: scene.seats.map((seat) => ({ ...seat })),
      characters: scene.characters.map((character) => ({ ...character })),
    };
  }
  return {
    projectId,
    revision: 0,
    name: OFFICE_SCENE_NAME,
    backgroundAssetId: null,
    imageWidth: BUNDLED_OFFICE_IMAGE.width,
    imageHeight: BUNDLED_OFFICE_IMAGE.height,
    seats: createDefaultOfficeSeats(),
    characters: [],
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
  projectId,
  scene,
  agents,
  open,
  onOpenChange,
  onSaved,
  onReload,
}: SceneEditorProps) {
  const [draft, setDraft] = useState<SceneDraft>(() => createDraft(scene, projectId));
  const [preview, setPreview] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(createDraft(scene, projectId));
      setPreview(false);
      setSaveError(null);
      setDrag(null);
    }
    wasOpenRef.current = open;
  }, [open, projectId, scene]);

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

  const characterUploadMutation = useMutation({
    mutationFn: (file: File) => officeApi.uploadCharacter(companyId, file),
    onSuccess: (uploaded) => {
      setDraft((current) => {
        if (current.characters.length >= OFFICE_SCENE_MAX_CHARACTERS) return current;
        const highestZIndex = Math.max(
          0,
          ...current.seats.map((seat) => seat.zIndex),
          ...current.characters.map((character) => character.zIndex),
        );
        return {
          ...current,
          characters: [
            ...current.characters,
            {
              id: crypto.randomUUID(),
              assetId: uploaded.assetId,
              x: 0.4,
              y: 0.4,
              width: 0.2,
              height: 0.2,
              zIndex: Math.min(1_000, highestZIndex + 1),
            },
          ],
        };
      });
      setPreview(false);
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "Could not upload the character art.");
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

  function updateDraftCharacter(characterId: string, changes: Partial<OfficeCharacter>) {
    setDraft((current) => ({
      ...current,
      characters: current.characters.map((character) => (
        character.id === characterId ? updateOfficeCharacter(character, changes) : character
      )),
    }));
  }

  function removeCharacter(characterId: string) {
    setDraft((current) => ({
      ...current,
      characters: current.characters.filter((character) => character.id !== characterId),
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

  function handleCharacterUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (draft.characters.length >= OFFICE_SCENE_MAX_CHARACTERS) {
      setSaveError(`A scene can have at most ${OFFICE_SCENE_MAX_CHARACTERS} character layers.`);
      return;
    }
    if (file.size > OFFICE_MAX_BACKGROUND_BYTES) {
      setSaveError("Choose character art smaller than 5 MiB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setSaveError("Choose a raster image file.");
      return;
    }
    setSaveError(null);
    characterUploadMutation.mutate(file);
  }

  function startDrag(
    event: PointerEvent<HTMLElement>,
    layer: DragState["layer"],
    value: OfficeSeat | OfficeCharacter,
    mode: DragState["mode"],
  ) {
    if (preview || event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture(event.pointerId);
    setDrag({
      layer,
      layerId: value.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initial: value,
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
      const changes = { x: drag.initial.x + deltaX, y: drag.initial.y + deltaY };
      if (drag.layer === "seat") updateDraftSeat(drag.layerId, changes);
      else updateDraftCharacter(drag.layerId, changes);
      return;
    }
    const changes = {
      width: drag.initial.width + deltaX,
      height: drag.initial.height + deltaY,
    };
    if (drag.layer === "seat") updateDraftSeat(drag.layerId, changes);
    else updateDraftCharacter(drag.layerId, changes);
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
      setDraft(createDraft(reloaded, projectId));
      setSaveError(null);
      setPreview(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not reload the scene.");
    }
  }

  function saveDraft() {
    if (saveLockRef.current || uploadMutation.isPending || characterUploadMutation.isPending || saveMutation.isPending) return;
    const seats = draft.seats.map(clampOfficeSeat);
    const characters = draft.characters.map(clampOfficeCharacter);
    if (hasDuplicateSeatBinding(seats)) {
      setSaveError("An agent can only be assigned to one seat.");
      return;
    }
    setSaveError(null);
    saveLockRef.current = true;
    saveMutation.mutate({
      projectId: draft.projectId,
      revision: draft.revision,
      name: draft.name.trim() || OFFICE_SCENE_NAME,
      backgroundAssetId: draft.backgroundAssetId,
      imageWidth: draft.imageWidth,
      imageHeight: draft.imageHeight,
      seats,
      characters,
    });
  }

  const stageStyle = { aspectRatio: `${draft.imageWidth} / ${draft.imageHeight}` } as CSSProperties;
  const pending = uploadMutation.isPending || characterUploadMutation.isPending || saveMutation.isPending;

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
              <div className="space-y-2">
                <Label htmlFor="office-scene-character">Character art</Label>
                <Input
                  id="office-scene-character"
                  className="min-h-(--sz-44px)"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleCharacterUpload}
                  disabled={pending || draft.characters.length >= OFFICE_SCENE_MAX_CHARACTERS}
                />
                <p className="text-xs text-muted-foreground">
                  Adds decorative art only. It never changes agent, task, or run state.
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
              {draft.characters.map((character, index) => (
                <div
                  key={character.id}
                  className="office-editor-character"
                  style={officeCharacterStyle(character)}
                  role="img"
                  aria-label={`Character art ${index + 1}`}
                  onPointerDown={(event) => startDrag(event, "character", character, "move")}
                >
                  <img src={draftImageSource(character.assetId)} alt="" draggable={false} />
                  {!preview ? (
                    <button
                      type="button"
                      data-office-resize
                      aria-label={`Resize character art ${index + 1}`}
                      className="office-editor-resize"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startDrag(event, "character", character, "resize");
                      }}
                    />
                  ) : null}
                </div>
              ))}
              {draft.seats.map((seat) => (
                <div
                  key={seat.id}
                  className="office-editor-seat"
                  style={officeSeatStyle(seat)}
                  onPointerDown={(event) => startDrag(event, "seat", seat, "move")}
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
                        startDrag(event, "seat", seat, "resize");
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

              {draft.characters.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Character layers</h3>
                  {draft.characters.map((character, index) => (
                    <fieldset key={character.id} className="rounded-lg border border-border p-3">
                      <legend className="px-1 text-sm font-medium">Character {index + 1}</legend>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {(["x", "y", "width", "height", "zIndex"] as const).map((field) => (
                          <label key={field} className="space-y-1 text-sm">
                            <span>{field}</span>
                            <Input
                              className="min-h-(--sz-44px)"
                              type="number"
                              min="0"
                              max={field === "zIndex" ? "1000" : "1"}
                              step={field === "zIndex" ? "1" : "0.01"}
                              value={field === "zIndex" ? String(character[field]) : roundedSeatValue(character[field])}
                              onChange={(event) => {
                                const value = event.currentTarget.valueAsNumber;
                                if (Number.isFinite(value)) updateDraftCharacter(character.id, { [field]: value });
                              }}
                            />
                          </label>
                        ))}
                        <div className="flex items-end">
                          <Button type="button" variant="outline" className="min-h-(--sz-44px)" onClick={() => removeCharacter(character.id)}>
                            Remove character
                          </Button>
                        </div>
                      </div>
                    </fieldset>
                  ))}
                </div>
              ) : null}
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
            {saveMutation.isPending ? "Saving…" : uploadMutation.isPending || characterUploadMutation.isPending ? "Uploading…" : "Save layout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
