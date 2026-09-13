import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { OfficeCharacter, OfficeSeat } from "@/api/office";
import {
  BUNDLED_OFFICE_IMAGE,
  officeCharacterStyle,
  officeSeatStyle,
  type OfficeAgentCardView,
} from "@/lib/office";
import { AgentCard } from "./AgentCard";

interface OfficeSceneProps {
  backgroundAssetId: string | null;
  imageWidth: number;
  imageHeight: number;
  seats: OfficeSeat[];
  characters: OfficeCharacter[];
  cards: OfficeAgentCardView[];
  selectedAgentId: string | null;
  mobileVisible?: boolean;
  onSelectAgent: (card: OfficeAgentCardView) => void;
}

function sceneImageSource(backgroundAssetId: string | null): string {
  return backgroundAssetId
    ? `/api/assets/${encodeURIComponent(backgroundAssetId)}/content`
    : BUNDLED_OFFICE_IMAGE.src;
}

export function OfficeScene({
  backgroundAssetId,
  imageWidth,
  imageHeight,
  seats,
  characters,
  cards,
  selectedAgentId,
  mobileVisible = false,
  onSelectAgent,
}: OfficeSceneProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  useEffect(() => {
    setImageFailed(false);
    setImageAttempt(0);
  }, [backgroundAssetId, imageWidth, imageHeight]);

  const cardsByAgentId = new Map(cards.map((card) => [card.agent.id, card]));
  const stageStyle = { aspectRatio: `${imageWidth} / ${imageHeight}` } as CSSProperties;
  const imageSource = useMemo(() => {
    const source = sceneImageSource(backgroundAssetId);
    if (imageAttempt === 0) return source;
    return `${source}${source.includes("?") ? "&" : "?"}officeRetry=${imageAttempt}`;
  }, [backgroundAssetId, imageAttempt]);

  return (
    <section className="office-scene" aria-label="AI Office scene" data-mobile-visible={mobileVisible || undefined}>
      <div className="office-scene-stage" style={stageStyle} data-image-failed={imageFailed || undefined}>
        {!imageFailed ? (
          <img
            src={imageSource}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <div className="absolute inset-0" aria-live="polite">
          {characters.map((character) => (
            <img
              key={character.id}
              src={`/api/assets/${encodeURIComponent(character.assetId)}/content`}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="office-character"
              style={officeCharacterStyle(character)}
            />
          ))}
          {seats.map((seat) => {
            const card = seat.agentId ? cardsByAgentId.get(seat.agentId) ?? null : null;
            return (
              <div key={seat.id} className="office-seat" style={officeSeatStyle(seat)}>
                {card ? (
                  <AgentCard
                    card={card}
                    variant="scene"
                    selected={selectedAgentId === card.agent.id}
                    onSelect={onSelectAgent}
                  />
                ) : (
                  <div className="office-empty-seat" aria-label={`${seat.label} is unassigned`}>
                    <span className="truncate">{seat.label}</span>
                    <span className="office-empty-seat-label">{seat.agentId ? "Unavailable agent" : "Unassigned"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {imageFailed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="status">
          <p className="text-sm text-muted-foreground">The office background could not load. Agent cards remain available.</p>
          <button
            type="button"
            className="min-h-(--sz-44px) text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setImageFailed(false);
              setImageAttempt((attempt) => attempt + 1);
            }}
          >
            Retry background
          </button>
        </div>
      ) : null}
    </section>
  );
}
