import type { PageCrop } from './types';

export class ObjectUrlTracker {
  private activeUrls: Set<string> = new Set();

  /**
   * Creates and registers a blob URL for lifetime tracking.
   */
  create(blob: Blob | MediaSource): string {
    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    return url;
  }

  /**
   * Revokes a specific registered URL.
   */
  revoke(url: string): void {
    if (this.activeUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore errors
      }
      this.activeUrls.delete(url);
    }
  }

  /**
   * Revokes all tracked URLs to prevent browser memory leaks.
   */
  revokeAll(): void {
    for (const url of this.activeUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore errors
      }
    }
    this.activeUrls.clear();
  }
}

export interface RenderPageOptions {
  scale?: number;
  rotation?: number;
  crop?: PageCrop | null;
  drawCanvas?: HTMLCanvasElement | null;
}

export interface RenderResult {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
}

export class PdfRenderer {
  private currentRenderTask: any | null = null;
  public urlTracker: ObjectUrlTracker = new ObjectUrlTracker();

  /**
   * Cancels any in-flight PDF.js render task to prevent race conditions during page flipping or zooming.
   */
  cancelCurrentRender(): void {
    if (this.currentRenderTask) {
      try {
        this.currentRenderTask.cancel();
      } catch {
        // Ignore cancellation errors
      }
      this.currentRenderTask = null;
    }
  }

  /**
   * Renders a PDF.js page onto a target canvas with viewport calculation,
   * cancellation protection, optional crop overlay, and synchronized secondary draw canvas sizing.
   */
  async renderPage(
    page: any,
    renderCanvas: HTMLCanvasElement,
    options: RenderPageOptions = {}
  ): Promise<RenderResult | null> {
    const scale = options.scale ?? 1.0;
    const userRotation = options.rotation ?? 0;
    const crop = options.crop ?? null;
    const drawCanvas = options.drawCanvas ?? null;

    // 1. Cancel previous rendering task if running
    this.cancelCurrentRender();

    const rotation = ((page.rotate || 0) + userRotation) % 360;
    const viewport = page.getViewport({ scale: scale * 1.5, rotation });

    const pixelW = Math.round(viewport.width);
    const pixelH = Math.round(viewport.height);
    const dispW = viewport.width / 1.5;
    const dispH = viewport.height / 1.5;

    renderCanvas.width = pixelW;
    renderCanvas.height = pixelH;
    renderCanvas.style.width = `${dispW}px`;
    renderCanvas.style.height = `${dispH}px`;

    if (drawCanvas) {
      drawCanvas.width = pixelW;
      drawCanvas.height = pixelH;
      drawCanvas.style.width = `${dispW}px`;
      drawCanvas.style.height = `${dispH}px`;
    }

    const ctx = renderCanvas.getContext('2d');
    if (!ctx) return null;

    // 2. Start PDF.js render task
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });
    this.currentRenderTask = renderTask;

    try {
      await renderTask.promise;
    } catch (err: any) {
      // PDF.js throws RenderingCancelledException when cancel() is triggered
      if (err?.name === 'RenderingCancelledException' || err?.message?.includes('cancelled')) {
        return null;
      }
      throw err;
    } finally {
      if (this.currentRenderTask === renderTask) {
        this.currentRenderTask = null;
      }
    }

    // 3. Handle page crop if crop is applied to this page
    if (crop && crop.croppedSrc) {
      await new Promise<void>((resolve, reject) => {
        const croppedImg = new Image();
        croppedImg.onload = () => {
          renderCanvas.width = croppedImg.width;
          renderCanvas.height = croppedImg.height;
          const finalDispW = crop.newWidth || Math.round(croppedImg.width / 1.5);
          const finalDispH = crop.newHeight || Math.round(croppedImg.height / 1.5);
          renderCanvas.style.width = `${finalDispW}px`;
          renderCanvas.style.height = `${finalDispH}px`;

          if (drawCanvas) {
            drawCanvas.width = croppedImg.width;
            drawCanvas.height = croppedImg.height;
            drawCanvas.style.width = `${finalDispW}px`;
            drawCanvas.style.height = `${finalDispH}px`;
          }

          ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
          ctx.drawImage(croppedImg, 0, 0);
          resolve();
        };
        croppedImg.onerror = reject;
        croppedImg.src = crop.croppedSrc;
      });
    }

    return {
      width: renderCanvas.width,
      height: renderCanvas.height,
      displayWidth: parseFloat(renderCanvas.style.width) || dispW,
      displayHeight: parseFloat(renderCanvas.style.height) || dispH,
    };
  }

  /**
   * Cleanup resources when destroying or switching documents.
   */
  destroy(): void {
    this.cancelCurrentRender();
    this.urlTracker.revokeAll();
  }
}
