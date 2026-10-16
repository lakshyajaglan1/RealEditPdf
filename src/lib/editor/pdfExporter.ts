import type {
  AnnotationsMap,
  PageRotationsMap,
  PageCropsMap,
  Annotation,
} from './types';

export interface ExportPdfOptions {
  pdfBytes: Uint8Array;
  pdfDocProxy: any;
  annotations: AnnotationsMap;
  pageRotations: PageRotationsMap;
  pageCrops: PageCropsMap;
  currentPageNumber?: number;
  currentPageDisplaySize?: { width: number; height: number };
  scale?: number;
}

async function getPdfLib() {
  if (typeof window !== 'undefined' && (window as any).PDFLib) {
    return (window as any).PDFLib;
  }
  return await import('pdf-lib');
}

/**
 * Compiles a high-resolution PDF document with all annotations, drawings, crops, rotations,
 * and high-DPI (300 DPI) flattening for pages containing redactions.
 */
export async function exportPdfWithAnnotations(options: ExportPdfOptions): Promise<Uint8Array> {
  const {
    pdfBytes,
    pdfDocProxy,
    annotations,
    pageRotations,
    pageCrops,
    currentPageNumber = 1,
    currentPageDisplaySize,
    scale = 1.0,
  } = options;

  const { PDFDocument, rgb, degrees, StandardFonts } = await getPdfLib();
  const fontSans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let fontSerif = fontSans;
  let fontMono = fontSans;
  try {
    fontSerif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  } catch {
    // Fallback to fontSans
  }
  const font = fontSans;

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  // Check if any page contains redact annotations
  let anyRedacted = false;
  for (let p = 1; p <= totalPages; p++) {
    if ((annotations[p] || []).some((a) => a.type === 'redact')) {
      anyRedacted = true;
      break;
    }
  }

  // Process pages in reverse or order (0-indexed)
  for (let i = 0; i < totalPages; i++) {
    const pNum = i + 1;
    const pageAnnots: Annotation[] = annotations[pNum] || [];
    const hasRedact = pageAnnots.some((a) => a.type === 'redact');

    if (hasRedact) {
      // (1) Render that page into a flat bitmap image at 3x scale (~300 DPI output)
      // with black redaction boxes burned directly into canvas pixels
      const RASTER_SCALE = 3.0;
      const pdfjsPage = await pdfDocProxy.getPage(pNum);
      const userRotation = pageRotations[pNum] || 0;
      const totalRotation = ((pdfjsPage.rotate || 0) + userRotation) % 360;
      const viewport = pdfjsPage.getViewport({ scale: RASTER_SCALE, rotation: totalRotation });

      const offCanvas = document.createElement('canvas');
      offCanvas.width = Math.round(viewport.width);
      offCanvas.height = Math.round(viewport.height);
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) continue;

      // Draw clean white background (standard for PDF rendering)
      offCtx.fillStyle = '#ffffff';
      offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

      // Render vector PDF page contents onto canvas
      await pdfjsPage.render({ canvasContext: offCtx, viewport }).promise;

      // Handle page crop if crop is applied to this page
      let displayWidth: number;
      let displayHeight: number;

      if (pageCrops && pageCrops[pNum]) {
        const crop = pageCrops[pNum];
        const croppedImg = new Image();
        await new Promise<void>((res, rej) => {
          croppedImg.onload = () => res();
          croppedImg.onerror = rej;
          croppedImg.src = crop.croppedSrc;
        });
        const dispW = crop.newWidth || Math.round(crop.width / 1.5);
        const dispH = crop.newHeight || Math.round(crop.height / 1.5);
        offCanvas.width = Math.round(dispW * RASTER_SCALE);
        offCanvas.height = Math.round(dispH * RASTER_SCALE);
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        offCtx.drawImage(croppedImg, 0, 0, offCanvas.width, offCanvas.height);
        displayWidth = dispW;
        displayHeight = dispH;
      } else {
        const baseVp = pdfjsPage.getViewport({ scale: 1.0, rotation: totalRotation });
        displayWidth =
          pNum === currentPageNumber && currentPageDisplaySize
            ? currentPageDisplaySize.width
            : baseVp.width * (scale || 1.0);
        displayHeight =
          pNum === currentPageNumber && currentPageDisplaySize
            ? currentPageDisplaySize.height
            : baseVp.height * (scale || 1.0);
      }

      const scaleToCanvasX = offCanvas.width / displayWidth;
      const scaleToCanvasY = offCanvas.height / displayHeight;

      // 1a. Under-watermarks
      const underWatermarks = pageAnnots.filter(
        (a) => a.type === 'watermark' && a.underText !== false
      );
      for (const wm of underWatermarks) {
        offCtx.save();
        const textStr = wm.text || 'CONFIDENTIAL';
        const fontSize = (wm.fontSize || 48) * scaleToCanvasY;
        offCtx.font = `bold ${fontSize}px sans-serif`;
        offCtx.fillStyle = wm.color || '#ef4444';
        offCtx.globalAlpha = wm.opacity !== undefined ? wm.opacity : 0.2;
        const metrics = offCtx.measureText(textStr);
        const wmDisplayW = wm.width || metrics.width / scaleToCanvasX;
        const wmDisplayH = wm.height || fontSize / scaleToCanvasY;
        const centerX = (wm.x + wmDisplayW / 2) * scaleToCanvasX;
        const centerY = (wm.y + wmDisplayH / 2) * scaleToCanvasY;
        offCtx.translate(centerX, centerY);
        offCtx.rotate(((wm.rotation || 0) * Math.PI) / 180);
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.fillText(textStr, 0, 0);
        offCtx.restore();
      }

      // 1b. Texts, shapes, images, stamps, signatures, over-watermarks
      for (const annot of pageAnnots) {
        if (annot.type === 'watermark' && annot.underText === false) {
          offCtx.save();
          const textStr = annot.text || 'CONFIDENTIAL';
          const fontSize = (annot.fontSize || 48) * scaleToCanvasY;
          offCtx.font = `bold ${fontSize}px sans-serif`;
          offCtx.fillStyle = annot.color || '#ef4444';
          offCtx.globalAlpha = annot.opacity !== undefined ? annot.opacity : 0.2;
          const metrics = offCtx.measureText(textStr);
          const wmDisplayW = annot.width || metrics.width / scaleToCanvasX;
          const wmDisplayH = annot.height || fontSize / scaleToCanvasY;
          const centerX = (annot.x + wmDisplayW / 2) * scaleToCanvasX;
          const centerY = (annot.y + wmDisplayH / 2) * scaleToCanvasY;
          offCtx.translate(centerX, centerY);
          offCtx.rotate(((annot.rotation || 0) * Math.PI) / 180);
          offCtx.textAlign = 'center';
          offCtx.textBaseline = 'middle';
          offCtx.fillText(textStr, 0, 0);
          offCtx.restore();
        } else if (annot.type === 'text') {
          offCtx.save();
          const tFontSize = (annot.fontSize || 16) * scaleToCanvasY;
          const tFontFamily = annot.fontFamily || 'sans-serif';
          offCtx.font = `${tFontSize}px ${tFontFamily}`;

          // Draw whiteout background box if enabled
          if (annot.bgWhiteout) {
            const metrics = offCtx.measureText(annot.text || '');
            const boxW = annot.width ? annot.width * scaleToCanvasX : metrics.width + 12 * scaleToCanvasX;
            const boxH = annot.height ? annot.height * scaleToCanvasY : tFontSize * 1.35;
            offCtx.fillStyle = annot.customBgColor || '#ffffff';
            offCtx.fillRect(
              annot.x * scaleToCanvasX - 3 * scaleToCanvasX,
              annot.y * scaleToCanvasY - 2 * scaleToCanvasY,
              boxW,
              boxH
            );
          }

          offCtx.fillStyle = annot.color || '#171717';
          offCtx.textBaseline = 'top';
          offCtx.fillText(annot.text || '', annot.x * scaleToCanvasX, annot.y * scaleToCanvasY);
          offCtx.restore();
        } else if (annot.type === 'shape') {
          offCtx.save();
          const sw = (annot.width || 120) * scaleToCanvasX;
          const sh = (annot.height || 60) * scaleToCanvasY;
          const sx = annot.x * scaleToCanvasX;
          const sy = annot.y * scaleToCanvasY;
          offCtx.strokeStyle = annot.color || '#171717';
          offCtx.fillStyle = annot.color || '#171717';
          offCtx.lineWidth = (annot.strokeWidth || 2) * scaleToCanvasX;
          offCtx.globalAlpha = annot.opacity !== undefined ? annot.opacity : 1.0;

          if (annot.shapeType === 'rect') {
            offCtx.strokeRect(sx, sy, sw, sh);
          } else if (annot.shapeType === 'rounded-rect') {
            if ((offCtx as any).roundRect) {
              offCtx.beginPath();
              (offCtx as any).roundRect(sx, sy, sw, sh, 6 * scaleToCanvasX);
              offCtx.stroke();
            } else {
              offCtx.strokeRect(sx, sy, sw, sh);
            }
          } else if (annot.shapeType === 'circle') {
            offCtx.beginPath();
            offCtx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
            offCtx.stroke();
          } else if (annot.shapeType === 'line') {
            offCtx.beginPath();
            offCtx.moveTo(sx, sy);
            offCtx.lineTo(sx + sw, sy);
            offCtx.stroke();
          } else if (annot.shapeType === 'check') {
            const fSize = Math.min(sw, sh) * 0.75;
            offCtx.font = `${fSize}px sans-serif`;
            offCtx.textBaseline = 'middle';
            offCtx.textAlign = 'center';
            offCtx.fillText('✓', sx + sw / 2, sy + sh / 2);
          } else if (annot.shapeType === 'cross') {
            const fSize = Math.min(sw, sh) * 0.75;
            offCtx.font = `${fSize}px sans-serif`;
            offCtx.textBaseline = 'middle';
            offCtx.textAlign = 'center';
            offCtx.fillText('X', sx + sw / 2, sy + sh / 2);
          } else if (annot.shapeType === 'arrow') {
            const fSize = Math.min(sw, sh) * 0.75;
            offCtx.font = `${fSize}px sans-serif`;
            offCtx.textBaseline = 'middle';
            offCtx.textAlign = 'center';
            offCtx.fillText('➔', sx + sw / 2, sy + sh / 2);
          }
          offCtx.restore();
        } else if (annot.type === 'signature' || annot.type === 'image' || annot.type === 'stamp') {
          if (!annot.src) continue;
          offCtx.save();
          const iw = (annot.width || 160) * scaleToCanvasX;
          const ih = (annot.height || (annot.type === 'stamp' ? 60 : 70)) * scaleToCanvasY;
          const ix = annot.x * scaleToCanvasX;
          const iy = annot.y * scaleToCanvasY;
          const img = new Image();
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = rej;
            img.src = annot.src!;
          });
          offCtx.globalAlpha = annot.opacity !== undefined ? annot.opacity : 1.0;
          const rotDeg = annot.rotation || 0;
          if (rotDeg !== 0) {
            offCtx.translate(ix + iw / 2, iy + ih / 2);
            offCtx.rotate((rotDeg * Math.PI) / 180);
            offCtx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
          } else {
            offCtx.drawImage(img, ix, iy, iw, ih);
          }
          offCtx.restore();
        } else if (annot.type === 'sticky') {
          offCtx.save();
          const sx = annot.x * scaleToCanvasX;
          const sy = annot.y * scaleToCanvasY;
          const sw = (annot.width || 200) * scaleToCanvasX;
          const sh = (annot.height || 120) * scaleToCanvasY;
          const color = annot.noteColor || '#fef08a';

          if (annot.stickyExpanded !== false) {
            // Draw callout box
            offCtx.fillStyle = color;
            offCtx.strokeStyle = 'rgba(0,0,0,0.15)';
            offCtx.lineWidth = 1 * scaleToCanvasX;
            offCtx.beginPath();
            if (typeof (offCtx as any).roundRect === 'function') {
              (offCtx as any).roundRect(sx, sy, sw, sh, 8 * scaleToCanvasX);
            } else {
              offCtx.rect(sx, sy, sw, sh);
            }
            offCtx.fill();
            offCtx.stroke();

            // Top header stripe
            offCtx.fillStyle = 'rgba(0,0,0,0.06)';
            offCtx.fillRect(sx, sy, sw, 20 * scaleToCanvasY);

            // Note header text
            offCtx.fillStyle = '#171717';
            offCtx.font = `bold ${Math.max(9, 10 * scaleToCanvasY)}px sans-serif`;
            offCtx.fillText(`Note: ${annot.author || 'Reviewer'}`, sx + 8 * scaleToCanvasX, sy + 14 * scaleToCanvasY);

            // Note body text
            offCtx.fillStyle = '#171717';
            offCtx.font = `${Math.max(9, 10 * scaleToCanvasY)}px sans-serif`;
            const lines = (annot.text || '').split('\n');
            let lineY = sy + 32 * scaleToCanvasY;
            for (const line of lines) {
              if (lineY > sy + sh - 8) break;
              offCtx.fillText(line, sx + 8 * scaleToCanvasX, lineY, sw - 16 * scaleToCanvasX);
              lineY += 13 * scaleToCanvasY;
            }
          } else {
            // Collapsed pin
            const radius = 12 * scaleToCanvasX;
            offCtx.fillStyle = color;
            offCtx.strokeStyle = 'rgba(0,0,0,0.2)';
            offCtx.lineWidth = 1.5 * scaleToCanvasX;
            offCtx.beginPath();
            offCtx.arc(sx + radius, sy + radius, radius, 0, Math.PI * 2);
            offCtx.fill();
            offCtx.stroke();

            offCtx.fillStyle = '#171717';
            offCtx.font = `bold ${Math.max(9, 10 * scaleToCanvasY)}px sans-serif`;
            offCtx.textAlign = 'center';
            offCtx.textBaseline = 'middle';
            offCtx.fillText('💬', sx + radius, sy + radius);
          }
          offCtx.restore();
        }
      }

      // 1c. Freehand pen / highlighters (rendered on top of edited text and whiteout backgrounds)
      const drawAnnots = pageAnnots.filter((a) => a.type === 'draw');
      drawAnnots.forEach((drawItem) => {
        if (!drawItem.points || drawItem.points.length < 2) return;
        offCtx.save();
        offCtx.beginPath();
        offCtx.strokeStyle = drawItem.color || '#171717';
        offCtx.lineWidth = (drawItem.lineWidth || 2) * scaleToCanvasX;
        offCtx.globalAlpha = drawItem.opacity !== undefined ? drawItem.opacity : 1.0;
        offCtx.lineCap = 'round';
        offCtx.lineJoin = 'round';
        offCtx.moveTo(drawItem.points[0].x * scaleToCanvasX, drawItem.points[0].y * scaleToCanvasY);
        for (let pt = 1; pt < drawItem.points.length; pt++) {
          offCtx.lineTo(drawItem.points[pt].x * scaleToCanvasX, drawItem.points[pt].y * scaleToCanvasY);
        }
        offCtx.stroke();
        offCtx.restore();
      });

      // 1d. Burn solid black redaction boxes directly into canvas pixels (top-level overlay)
      const redactAnnots = pageAnnots.filter((a) => a.type === 'redact');
      for (const redact of redactAnnots) {
        const rw = (redact.width || 140) * scaleToCanvasX;
        const rh = (redact.height || 30) * scaleToCanvasY;
        const rx = redact.x * scaleToCanvasX;
        const ry = redact.y * scaleToCanvasY;
        offCtx.save();
        offCtx.fillStyle = '#000000';
        offCtx.fillRect(rx, ry, rw, rh);
        offCtx.restore();
      }

      // Export flat rasterized image
      const flatDataUrl = offCanvas.toDataURL('image/png');
      const flatBytes = await fetch(flatDataUrl).then((r) => r.arrayBuffer());
      const embeddedFlattenedImg = await pdfDoc.embedPng(flatBytes);

      // (2) Replace the original vector PDF page in pdf-lib with a new page containing ONLY the flattened image
      const finalPdfW = offCanvas.width / RASTER_SCALE;
      const finalPdfH = offCanvas.height / RASTER_SCALE;
      const newFlattenedPage = pdfDoc.insertPage(i, [finalPdfW, finalPdfH]);
      newFlattenedPage.drawImage(embeddedFlattenedImg, {
        x: 0,
        y: 0,
        width: finalPdfW,
        height: finalPdfH,
      });
      // Remove original vector page (shifted to index i + 1)
      pdfDoc.removePage(i + 1);

    } else {
      // (3) Keep unredacted pages 100% vector!
      const page = pdfDoc.getPage(i);
      const rotationAngle = pageRotations[pNum] || 0;
      if (rotationAngle !== 0) {
        page.setRotation(degrees((page.getRotation().angle + rotationAngle) % 360));
      }

      const { width: pWidth, height: pHeight } = page.getSize();
      const displayWidth =
        pNum === currentPageNumber && currentPageDisplaySize
          ? currentPageDisplaySize.width
          : pWidth * (scale || 1.0);
      const displayHeight =
        pNum === currentPageNumber && currentPageDisplaySize
          ? currentPageDisplaySize.height
          : pHeight * (scale || 1.0);
      const scaleX = pWidth / displayWidth;
      const scaleY = pHeight / displayHeight;

      // Apply page crop box if cropped
      if (pageCrops && pageCrops[pNum]) {
        const crop = pageCrops[pNum];
        const cropPdfX = crop.x * scaleX;
        const cropPdfW = crop.width * scaleX;
        const cropPdfH = crop.height * scaleY;
        const cropPdfY = pHeight - (crop.y + crop.height) * scaleY;
        page.setCropBox(cropPdfX, cropPdfY, cropPdfW, cropPdfH);
      }

      // 1. Embed Watermarks positioned UNDER original PDF text
      const underWatermarks = pageAnnots.filter(
        (a) => a.type === 'watermark' && a.underText !== false
      );
      if (underWatermarks.length > 0) {
        page.node.normalize();
        const prevStreamCount = page.node.Contents().size();
        page.getContentStream(false);

        for (const wm of underWatermarks) {
          const hex = wm.color || '#ef4444';
          const r = parseInt(hex.slice(1, 3), 16) / 255 || 0.9;
          const g = parseInt(hex.slice(3, 5), 16) / 255 || 0.2;
          const b = parseInt(hex.slice(5, 7), 16) / 255 || 0.2;
          const op = wm.opacity !== undefined ? wm.opacity : 0.2;
          const fontSize = (wm.fontSize || 48) * scaleY;
          const rotDeg = (((wm.rotation || 0) % 360) + 360) % 360;
          const textStr = wm.text || 'CONFIDENTIAL';

          const textW = font.widthOfTextAtSize(textStr, fontSize);
          const textH = font.heightAtSize(fontSize);

          const wmDisplayW = wm.width || textW / scaleX;
          const wmDisplayH = wm.height || textH / scaleY;
          const pdfCenterX = (wm.x + wmDisplayW / 2) * scaleX;
          const pdfCenterY = pHeight - (wm.y + wmDisplayH / 2) * scaleY;

          const rad = (-rotDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const drawX = pdfCenterX - (textW / 2) * cos + (textH / 2) * sin;
          const drawY = pdfCenterY - (textW / 2) * sin - (textH / 2) * cos;

          page.drawText(textStr, {
            x: drawX,
            y: drawY,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: op,
            rotate: degrees(-rotDeg),
          });
        }

        // Move newly created content stream to index 0 (beneath original PDF page contents)
        const contents = page.node.Contents();
        const addedCount = contents.size() - prevStreamCount;
        for (let k = 0; k < addedCount; k++) {
          const streamRef = contents.asArray().pop();
          contents.asArray().unshift(streamRef);
        }
      }

      // 2. Embed Over-Watermarks, texts, shapes, signatures, images, stamps (TOP OF VECTOR CONTENT)
      for (const annot of pageAnnots) {
        if (annot.type === 'watermark' && annot.underText === false) {
          const hex = annot.color || '#ef4444';
          const r = parseInt(hex.slice(1, 3), 16) / 255 || 0.9;
          const g = parseInt(hex.slice(3, 5), 16) / 255 || 0.2;
          const b = parseInt(hex.slice(5, 7), 16) / 255 || 0.2;
          const op = annot.opacity !== undefined ? annot.opacity : 0.2;
          const fontSize = (annot.fontSize || 48) * scaleY;
          const rotDeg = (((annot.rotation || 0) % 360) + 360) % 360;
          const textStr = annot.text || 'CONFIDENTIAL';

          const textW = font.widthOfTextAtSize(textStr, fontSize);
          const textH = font.heightAtSize(fontSize);

          const wmDisplayW = annot.width || textW / scaleX;
          const wmDisplayH = annot.height || textH / scaleY;
          const pdfCenterX = (annot.x + wmDisplayW / 2) * scaleX;
          const pdfCenterY = pHeight - (annot.y + wmDisplayH / 2) * scaleY;

          const rad = (-rotDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const drawX = pdfCenterX - (textW / 2) * cos + (textH / 2) * sin;
          const drawY = pdfCenterY - (textW / 2) * sin - (textH / 2) * cos;

          page.drawText(textStr, {
            x: drawX,
            y: drawY,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: op,
            rotate: degrees(-rotDeg),
          });
        } else if (annot.type === 'text') {
          const pdfX = annot.x * scaleX;
          const fontSize = (annot.fontSize || 16) * scaleY;
          const pdfY = pHeight - (annot.y + (annot.fontSize || 16)) * scaleY;
          const hex = annot.color || '#171717';
          const r = parseInt(hex.slice(1, 3), 16) / 255 || 0.09;
          const g = parseInt(hex.slice(3, 5), 16) / 255 || 0.09;
          const b = parseInt(hex.slice(5, 7), 16) / 255 || 0.09;

          let activeFont = fontSans;
          if (annot.fontFamily?.includes('serif') || annot.fontFamily?.includes('Times')) {
            activeFont = fontSerif;
          } else if (annot.fontFamily?.includes('mono') || annot.fontFamily?.includes('Courier')) {
            activeFont = fontMono;
          }

          // Draw whiteout background box if enabled
          if (annot.bgWhiteout) {
            const bgHex = annot.customBgColor || '#ffffff';
            const bgR = parseInt(bgHex.slice(1, 3), 16) / 255 || 1;
            const bgG = parseInt(bgHex.slice(3, 5), 16) / 255 || 1;
            const bgB = parseInt(bgHex.slice(5, 7), 16) / 255 || 1;
            const textWidthEstimate = activeFont.widthOfTextAtSize(annot.text || '', fontSize);
            const boxW = annot.width ? annot.width * scaleX : textWidthEstimate + 8 * scaleX;
            const boxH = annot.height ? annot.height * scaleY : fontSize * 1.3;

            page.drawRectangle({
              x: pdfX - 3 * scaleX,
              y: pdfY - 2 * scaleY,
              width: boxW,
              height: boxH,
              color: rgb(bgR, bgG, bgB),
            });
          }

          page.drawText(annot.text || '', {
            x: pdfX,
            y: pdfY,
            size: fontSize,
            font: activeFont,
            color: rgb(r, g, b),
          });
        } else if (annot.type === 'shape') {
          const w = annot.width || 120;
          const h = annot.height || 60;
          const pdfX = annot.x * scaleX;
          const pdfY = pHeight - (annot.y + h) * scaleY;
          const hex = annot.color || '#171717';
          const r = parseInt(hex.slice(1, 3), 16) / 255 || 0.09;
          const g = parseInt(hex.slice(3, 5), 16) / 255 || 0.09;
          const b = parseInt(hex.slice(5, 7), 16) / 255 || 0.09;

          if (annot.shapeType === 'rect' || annot.shapeType === 'rounded-rect') {
            page.drawRectangle({
              x: pdfX,
              y: pdfY,
              width: w * scaleX,
              height: h * scaleY,
              borderColor: rgb(r, g, b),
              borderWidth: (annot.strokeWidth || 2) * scaleX,
            });
          } else if (annot.shapeType === 'circle') {
            page.drawEllipse({
              x: pdfX + (w * scaleX) / 2,
              y: pdfY + (h * scaleY) / 2,
              xScale: (w * scaleX) / 2,
              yScale: (h * scaleY) / 2,
              borderColor: rgb(r, g, b),
              borderWidth: (annot.strokeWidth || 2) * scaleX,
            });
          } else if (annot.shapeType === 'line') {
            page.drawLine({
              start: { x: pdfX, y: pHeight - annot.y * scaleY },
              end: { x: pdfX + w * scaleX, y: pHeight - annot.y * scaleY },
              color: rgb(r, g, b),
              thickness: (annot.strokeWidth || 2) * scaleX,
            });
          } else if (annot.shapeType === 'check') {
            page.drawText('✓', {
              x: pdfX + w * scaleX * 0.15,
              y: pdfY + h * scaleY * 0.15,
              size: Math.min(w * scaleX, h * scaleY) * 0.75,
              font,
              color: rgb(r, g, b),
            });
          } else if (annot.shapeType === 'cross') {
            page.drawText('X', {
              x: pdfX + w * scaleX * 0.2,
              y: pdfY + h * scaleY * 0.15,
              size: Math.min(w * scaleX, h * scaleY) * 0.75,
              font,
              color: rgb(r, g, b),
            });
          } else if (annot.shapeType === 'arrow') {
            page.drawText('➔', {
              x: pdfX + w * scaleX * 0.1,
              y: pdfY + h * scaleY * 0.2,
              size: Math.min(w * scaleX, h * scaleY) * 0.75,
              font,
              color: rgb(r, g, b),
            });
          }
        } else if (annot.type === 'signature' || annot.type === 'image' || annot.type === 'stamp') {
          if (!annot.src) continue;
          const imgBytes = await fetch(annot.src).then((r) => r.arrayBuffer());
          let embeddedImg: any;
          if (annot.src.startsWith('data:image/png')) {
            embeddedImg = await pdfDoc.embedPng(imgBytes);
          } else {
            embeddedImg = await pdfDoc.embedJpg(imgBytes).catch(async () => await pdfDoc.embedPng(imgBytes));
          }

          const w = annot.width || 160;
          const h = annot.height || (annot.type === 'stamp' ? 60 : 70);
          const imgW = w * scaleX;
          const imgH = h * scaleY;
          const rotDeg = (((annot.rotation || 0) % 360) + 360) % 360;
          const op = annot.opacity !== undefined ? annot.opacity : 1.0;

          if (rotDeg === 0) {
            page.drawImage(embeddedImg, {
              x: annot.x * scaleX,
              y: pHeight - (annot.y + h) * scaleY,
              width: imgW,
              height: imgH,
              opacity: op,
            });
          } else {
            const pdfCenterX = (annot.x + w / 2) * scaleX;
            const pdfCenterY = pHeight - (annot.y + h / 2) * scaleY;
            const rad = (-rotDeg * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const drawX = pdfCenterX - (imgW / 2) * cos + (imgH / 2) * sin;
            const drawY = pdfCenterY - (imgW / 2) * sin - (imgH / 2) * cos;
            page.drawImage(embeddedImg, {
              x: drawX,
              y: drawY,
              width: imgW,
              height: imgH,
              rotate: degrees(-rotDeg),
              opacity: op,
            });
          }
        } else if (annot.type === 'sticky') {
          const noteColorHex = annot.noteColor || '#fef08a';
          const cR = parseInt(noteColorHex.slice(1, 3), 16) / 255 || 0.99;
          const cG = parseInt(noteColorHex.slice(3, 5), 16) / 255 || 0.94;
          const cB = parseInt(noteColorHex.slice(5, 7), 16) / 255 || 0.54;

          const w = (annot.width || 200) * scaleX;
          const h = (annot.height || 120) * scaleY;
          const pdfX = annot.x * scaleX;
          const pdfY = pHeight - (annot.y + (annot.height || 120)) * scaleY;

          if (annot.stickyExpanded !== false) {
            // 1. Draw rounded visual callout card
            page.drawRectangle({
              x: pdfX,
              y: pdfY,
              width: w,
              height: h,
              color: rgb(cR, cG, cB),
              borderColor: rgb(Math.max(0, cR - 0.2), Math.max(0, cG - 0.2), Math.max(0, cB - 0.2)),
              borderWidth: 1,
            });

            // 2. Draw subtle header bar
            const headerH = 18 * scaleY;
            page.drawRectangle({
              x: pdfX,
              y: pdfY + h - headerH,
              width: w,
              height: headerH,
              color: rgb(Math.max(0, cR - 0.08), Math.max(0, cG - 0.08), Math.max(0, cB - 0.08)),
            });

            // 3. Draw Header Title / Author
            page.drawText(`Note: ${annot.author || 'Reviewer'}`, {
              x: pdfX + 6 * scaleX,
              y: pdfY + h - headerH + 5 * scaleY,
              size: 8.5,
              font: fontMono || font,
              color: rgb(0.1, 0.1, 0.1),
            });

            // 4. Draw Wrapped Note Content
            const noteText = annot.text || '';
            const lines = noteText.split('\n');
            let textY = pdfY + h - headerH - 12 * scaleY;
            for (const rawLine of lines) {
              if (textY < pdfY + 4 * scaleY) break;
              const maxChars = Math.floor(w / 6);
              const displayLine = rawLine.length > maxChars ? rawLine.slice(0, maxChars - 1) + '…' : rawLine;
              page.drawText(displayLine, {
                x: pdfX + 6 * scaleX,
                y: textY,
                size: 9,
                font: fontSans,
                color: rgb(0.1, 0.1, 0.1),
              });
              textY -= 12 * scaleY;
            }
          } else {
            // Collapsed pin callout
            const pinSize = 22 * scaleX;
            page.drawRectangle({
              x: pdfX,
              y: pHeight - (annot.y + 22) * scaleY,
              width: pinSize,
              height: pinSize,
              color: rgb(cR, cG, cB),
              borderColor: rgb(0.2, 0.2, 0.2),
              borderWidth: 1,
            });
            page.drawText('N', {
              x: pdfX + 6 * scaleX,
              y: pHeight - (annot.y + 16) * scaleY,
              size: 11,
              font: fontMono || font,
              color: rgb(0.1, 0.1, 0.1),
            });
          }

          // 5. Native PDF Text Annotation (PDF Comment Annotation)
          try {
            const { PDFName, PDFString } = await getPdfLib();
            const nativeAnnot = pdfDoc.context.obj({
              Type: PDFName.of('Annot'),
              Subtype: PDFName.of('Text'),
              Rect: [pdfX, pdfY, pdfX + 24, pdfY + 24],
              Contents: PDFString.of(annot.text || 'Sticky Note'),
              Name: PDFName.of('Comment'),
              T: PDFString.of(annot.author || 'Reviewer'),
              C: [cR, cG, cB],
            });
            const nativeRef = pdfDoc.context.register(nativeAnnot);
            page.node.addAnnot(nativeRef);
          } catch (nativeErr) {
            console.warn('Native PDF text annotation export:', nativeErr);
          }
        }
      }

      // 3. Embed Freehand drawings and highlights layer on top of text annotations
      const drawAnnots = pageAnnots.filter((a) => a.type === 'draw');
      if (drawAnnots.length > 0) {
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = pWidth * 2;
        offscreenCanvas.height = pHeight * 2;
        const offCtx = offscreenCanvas.getContext('2d');

        if (offCtx) {
          const scaleToExportX = (pWidth * 2) / displayWidth;
          const scaleToExportY = (pHeight * 2) / displayHeight;

          drawAnnots.forEach((drawItem) => {
            if (!drawItem.points || drawItem.points.length < 2) return;
            offCtx.save();
            offCtx.beginPath();
            offCtx.strokeStyle = drawItem.color || '#171717';
            offCtx.lineWidth = (drawItem.lineWidth || 2) * scaleToExportX;
            offCtx.globalAlpha = drawItem.opacity !== undefined ? drawItem.opacity : 1.0;
            offCtx.lineCap = 'round';
            offCtx.lineJoin = 'round';

            offCtx.moveTo(drawItem.points[0].x * scaleToExportX, drawItem.points[0].y * scaleToExportY);
            for (let pt = 1; pt < drawItem.points.length; pt++) {
              offCtx.lineTo(drawItem.points[pt].x * scaleToExportX, drawItem.points[pt].y * scaleToExportY);
            }
            offCtx.stroke();
            offCtx.restore();
          });

          const drawPngDataUrl = offscreenCanvas.toDataURL('image/png');
          const drawPngBytes = await fetch(drawPngDataUrl).then((r) => r.arrayBuffer());
          const embeddedDrawLayer = await pdfDoc.embedPng(drawPngBytes);
          page.drawImage(embeddedDrawLayer, {
            x: 0,
            y: 0,
            width: pWidth,
            height: pHeight,
          });
        }
      }
    }
  }

  let finalDoc = pdfDoc;
  if (anyRedacted) {
    const cleanDoc = await PDFDocument.create();
    const pageIndices = pdfDoc.getPageIndices();
    const copiedPages = await cleanDoc.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((p: any) => cleanDoc.addPage(p));
    finalDoc = cleanDoc;
  }

  return await finalDoc.save({ useObjectStreams: true });
}
