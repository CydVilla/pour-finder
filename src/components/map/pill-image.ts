/**
 * Stretchable rounded-rect icons for the price markers.
 *
 * Drawing these once as stretchable images (rather than rendering DOM markers)
 * is what lets the map hold thousands of pins at 60fps: every marker is a GPU
 * symbol, and MapLibre stretches one pill to fit "$1" or "$14.50" via
 * icon-text-fit.
 */
export interface PillImage {
  data: ImageData;
  options: {
    pixelRatio: number;
    stretchX: [number, number][];
    stretchY: [number, number][];
    content: [number, number, number, number];
  };
}

const SIZE = 56; // device px
const RADIUS = 14;
const PIXEL_RATIO = 2;

export function createPillImage(fill: string, stroke: string, strokeWidth = 3): PillImage | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, SIZE, SIZE);

  // Soft drop shadow keeps pills legible over busy basemap areas.
  ctx.shadowColor = "rgba(23, 19, 15, 0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  roundedRect(ctx, strokeWidth / 2, strokeWidth / 2, SIZE - strokeWidth, SIZE - strokeWidth, RADIUS);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  return {
    data: ctx.getImageData(0, 0, SIZE, SIZE),
    options: {
      pixelRatio: PIXEL_RATIO,
      // Only the middle band stretches, so the rounded caps stay circular.
      stretchX: [[RADIUS + strokeWidth, SIZE - RADIUS - strokeWidth]],
      stretchY: [[RADIUS + strokeWidth, SIZE - RADIUS - strokeWidth]],
      content: [strokeWidth + 2, strokeWidth + 2, SIZE - strokeWidth - 2, SIZE - strokeWidth - 2],
    },
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Marker palettes. Stale data is visibly drained of colour, not hidden. */
export const PILL_STYLES = {
  default: { id: "pf-pill", fill: "#ffffff", stroke: "#17130f" },
  cheap: { id: "pf-pill-cheap", fill: "#f0a202", stroke: "#17130f" },
  stale: { id: "pf-pill-stale", fill: "#f2ece1", stroke: "#8a827a" },
  selected: { id: "pf-pill-selected", fill: "#17130f", stroke: "#f0a202" },
} as const;
