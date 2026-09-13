# AI Office night scene asset

Generated for the AI Office MVP on 2026-09-13 with one built-in `image_gen` call. The image is a single clean scene; names, status, actions, and other dashboard content remain HTML/UI overlays.

## Files

| Variant | Path | Dimensions | Size |
| --- | --- | ---: | ---: |
| Original PNG | `ui/public/office/office-night.png` | 1672 × 941 | 1,959,533 bytes |
| Web delivery | `ui/public/office/office-night.webp` | 1672 × 941 | 146,258 bytes |

The rendered aspect ratio is 1.7768:1, effectively 16:9 at the generator's native dimensions. The PNG remains below the 5 MiB first-upload limit. The WebP is approximately 143 KiB and stays below the 1 MB display target.

## Scene contract

- Exactly six friendly adult anime/chibi workers, each seated at one distinct desk.
- Two readable rows of three desks, with every desk fully visible from a slightly elevated frontal management-game view.
- Warm amber ceiling lighting, deep navy/charcoal room tones, restrained blue monitor glow, plants, wood, and a calm night-office mood.
- No embedded text, labels, status indicators, buttons, panels, sidebar, dashboard frame, logos, or watermark.
- The dark, low-detail desk fronts are the initial card surfaces. The scene editor should keep these rectangles adjustable because responsive card height can vary.

## Initial card rectangles

Coordinates use the source image's top-left origin and are normalized to `[0, 1]` as `{ x, y, width, height }`. They are centered on the blank desk fronts directly below each desktop and avoid the desk legs. Pixel estimates use 1672 × 941.

| Seat id | Row | Normalized rectangle | Approx. pixels |
| --- | --- | --- | --- |
| `back-left` | back | `{ x: 0.07, y: 0.36, width: 0.24, height: 0.10 }` | `(117, 339) 401 × 94` |
| `back-center` | back | `{ x: 0.38, y: 0.36, width: 0.24, height: 0.10 }` | `(635, 339) 401 × 94` |
| `back-right` | back | `{ x: 0.69, y: 0.36, width: 0.24, height: 0.10 }` | `(1154, 339) 401 × 94` |
| `front-left` | front | `{ x: 0.07, y: 0.73, width: 0.24, height: 0.11 }` | `(117, 687) 401 × 103` |
| `front-center` | front | `{ x: 0.38, y: 0.73, width: 0.24, height: 0.11 }` | `(635, 687) 401 × 103` |
| `front-right` | front | `{ x: 0.69, y: 0.73, width: 0.24, height: 0.11 }` | `(1154, 687) 401 × 103` |

These are starting placement guides, not a claim that the generated scene fixes a permanent layout. Save them with the scene revision and expose editor adjustments as normalized values.
