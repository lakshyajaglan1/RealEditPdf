import type { TextInspectionResult } from './types';

export interface InspectOptions {
  scale?: number;
  rotation?: number;
  displayWidth?: number;
  displayHeight?: number;
  padding?: number;
}

/**
 * Samples pixel color from canvas at specified pixel coordinates, converting to hex #RRGGBB.
 */
export function sampleCanvasColor(
  canvas: HTMLCanvasElement,
  pixelX: number,
  pixelY: number
): string {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#ffffff';

    const cx = Math.max(0, Math.min(canvas.width - 1, Math.round(pixelX)));
    const cy = Math.max(0, Math.min(canvas.height - 1, Math.round(pixelY)));

    // Sample a small 3x3 window around click to avoid sampling directly on a thin glyph stroke
    const offsets = [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
      [0, -3],
      [0, 3],
      [-3, 0],
      [3, 0],
      [0, 0],
    ];

    let bestColor = '#ffffff';
    let maxBrightness = -1;

    for (const [dx, dy] of offsets) {
      const sx = Math.max(0, Math.min(canvas.width - 1, cx + dx));
      const sy = Math.max(0, Math.min(canvas.height - 1, cy + dy));
      const data = ctx.getImageData(sx, sy, 1, 1).data;

      // Skip transparent or near-black pixels (which are likely the text stroke itself)
      if (data[3] < 40) continue;
      const brightness = 0.299 * data[0] + 0.587 * data[1] + 0.114 * data[2];

      // Prefer lighter background pixels (background is almost always lighter than the text)
      if (brightness > maxBrightness) {
        maxBrightness = brightness;
        const r = data[0].toString(16).padStart(2, '0');
        const g = data[1].toString(16).padStart(2, '0');
        const b = data[2].toString(16).padStart(2, '0');
        bestColor = `#${r}${g}${b}`;
      }
    }

    return bestColor;
  } catch {
    return '#ffffff';
  }
}

/**
 * Inspects PDF text content at a clicked point on the page canvas using PDF.js getTextContent().
 * If clicked on existing text, extracts the text string, calculated font size, bounding box,
 * and samples the canvas background color to pre-fill a whiteout replacement text box.
 */
export async function inspectTextAtPoint(
  page: any,
  renderCanvas: HTMLCanvasElement,
  clickPoint: { x: number; y: number },
  options: InspectOptions = {}
): Promise<TextInspectionResult | null> {
  if (!page || typeof page.getTextContent !== 'function' || !renderCanvas) {
    return null;
  }

  const displayW = options.displayWidth || parseFloat(renderCanvas.style.width) || (renderCanvas.width / 1.5) || 600;
  const displayH = options.displayHeight || parseFloat(renderCanvas.style.height) || (renderCanvas.height / 1.5) || 800;
  const userRotation = options.rotation ?? 0;
  const scale = options.scale ?? 1.0;
  const padding = options.padding ?? 6;

  const totalRotation = ((page.rotate || 0) + userRotation) % 360;
  const viewport = page.getViewport({ scale: scale * 1.5, rotation: totalRotation });

  // Convert click in display coordinates to viewport pixel space
  const pixelX = (clickPoint.x / displayW) * renderCanvas.width;
  const pixelY = (clickPoint.y / displayH) * renderCanvas.height;

  let textContent: any;
  try {
    textContent = await page.getTextContent({ normalizeWhitespace: true });
  } catch {
    return null;
  }

  if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
    return null;
  }

  let matchedItem: any = null;
  let minDistance = Infinity;
  let matchedBox = { x: 0, y: 0, width: 0, height: 0 };
  let matchedFontSize = 16;

  for (const item of textContent.items) {
    if (!item.str || typeof item.str !== 'string' || item.str.trim().length === 0) {
      continue;
    }

    const transform = item.transform; // [a, b, c, d, tx, ty]
    if (!transform || transform.length < 6) continue;

    const tx = transform[4];
    const ty = transform[5];
    const itemWidth = item.width || 0;
    const fontSizePdf = Math.hypot(transform[0], transform[1]) || item.height || 12;

    // Viewport transform points
    let p1: [number, number];
    let p2: [number, number];
    let p3: [number, number];
    let p4: [number, number];

    if (typeof viewport.convertToViewportPoint === 'function') {
      p1 = viewport.convertToViewportPoint(tx, ty);
      p2 = viewport.convertToViewportPoint(tx + itemWidth, ty);
      p3 = viewport.convertToViewportPoint(tx + itemWidth, ty + fontSizePdf);
      p4 = viewport.convertToViewportPoint(tx, ty + fontSizePdf);
    } else {
      continue;
    }

    const minX = Math.min(p1[0], p2[0], p3[0], p4[0]);
    const maxX = Math.max(p1[0], p2[0], p3[0], p4[0]);
    const minY = Math.min(p1[1], p2[1], p3[1], p4[1]);
    const maxY = Math.max(p1[1], p2[1], p3[1], p4[1]);

    // Check hit in viewport pixels with padding
    if (
      pixelX >= minX - padding &&
      pixelX <= maxX + padding &&
      pixelY >= minY - padding &&
      pixelY <= maxY + padding
    ) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const dist = Math.hypot(pixelX - centerX, pixelY - centerY);

      if (dist < minDistance) {
        minDistance = dist;
        matchedItem = item;

        // Convert viewport bounding box to display coordinates
        const boxX = (minX / renderCanvas.width) * displayW;
        const boxY = (minY / renderCanvas.height) * displayH;
        const boxW = ((maxX - minX) / renderCanvas.width) * displayW;
        const boxH = ((maxY - minY) / renderCanvas.height) * displayH;

        matchedBox = {
          x: Math.max(0, Math.round(boxX)),
          y: Math.max(0, Math.round(boxY)),
          width: Math.max(20, Math.round(boxW)),
          height: Math.max(14, Math.round(boxH)),
        };

        // Compute display font size based on bounding box height
        matchedFontSize = Math.max(10, Math.min(72, Math.round(boxH * 0.95)));
      }
    }
  }

  if (!matchedItem) {
    return null;
  }

  // Sample canvas background color at click point
  const sampledBg = sampleCanvasColor(renderCanvas, pixelX, pixelY);

  return {
    text: matchedItem.str,
    fontSize: matchedFontSize,
    bgColor: sampledBg,
    box: matchedBox,
  };
}
