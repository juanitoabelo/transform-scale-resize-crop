export type CropRect = { x: number; y: number; w: number; h: number };

export function transformedDimensions(
  naturalWidth: number,
  naturalHeight: number,
  rotationDeg: number
): { tw: number; th: number } {
  const r = ((rotationDeg % 360) + 360) % 360;
  if (r === 90 || r === 270) {
    return { tw: naturalHeight, th: naturalWidth };
  }
  return { tw: naturalWidth, th: naturalHeight };
}

export type FittedLayout = {
  scale: number;
  ox: number;
  oy: number;
  drawnW: number;
  drawnH: number;
};

export function fitTransformedRect(
  destW: number,
  destH: number,
  tw: number,
  th: number
): FittedLayout {
  const scale = Math.min(destW / tw, destH / th, 1);
  const drawnW = tw * scale;
  const drawnH = th * scale;
  const ox = (destW - drawnW) / 2;
  const oy = (destH - drawnH) / 2;
  return { scale, ox, oy, drawnW, drawnH };
}

/**
 * Draw the image with rotation (deg, clockwise) and flips, fitted inside destW × destH.
 */
export function drawTransformedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  destW: number,
  destH: number,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean
): void {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const { tw, th } = transformedDimensions(nw, nh, rotationDeg);
  const { scale, ox, oy, drawnW, drawnH } = fitTransformedRect(
    destW,
    destH,
    tw,
    th
  );
  const rad = (rotationDeg * Math.PI) / 180;
  const sx = (flipH ? -1 : 1) * scale;
  const sy = (flipV ? -1 : 1) * scale;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(ox + drawnW / 2, oy + drawnH / 2);
  ctx.rotate(rad);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -nw / 2, -nh / 2);
  ctx.restore();
}

export function canvasRectToCrop(
  rect: CropRect,
  layout: FittedLayout,
  tw: number,
  th: number
): CropRect {
  const { ox, oy, drawnW, drawnH } = layout;
  const x = ((rect.x - ox) / drawnW) * tw;
  const y = ((rect.y - oy) / drawnH) * th;
  const w = (rect.w / drawnW) * tw;
  const h = (rect.h / drawnH) * th;
  return clampCropToTransformed({ x, y, w, h }, tw, th);
}

export function cropToCanvasRect(
  crop: CropRect,
  layout: FittedLayout,
  tw: number,
  th: number
): CropRect {
  const { ox, oy, drawnW, drawnH } = layout;
  return {
    x: ox + (crop.x / tw) * drawnW,
    y: oy + (crop.y / th) * drawnH,
    w: (crop.w / tw) * drawnW,
    h: (crop.h / th) * drawnH,
  };
}

export function clampCropToTransformed(
  crop: CropRect,
  tw: number,
  th: number
): CropRect {
  let { x, y, w, h } = crop;
  x = Math.max(0, Math.min(x, tw));
  y = Math.max(0, Math.min(y, th));
  w = Math.max(1, Math.min(w, tw - x));
  h = Math.max(1, Math.min(h, th - y));
  return { x, y, w, h };
}

export function renderExportCanvas(
  img: HTMLImageElement,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean,
  crop: CropRect | null,
  targetWidth: number | null,
  targetHeight: number | null,
): HTMLCanvasElement {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const { tw, th } = transformedDimensions(nw, nh, rotationDeg);

  const full = document.createElement("canvas");
  full.width = tw;
  full.height = th;
  const fctx = full.getContext("2d");
  if (!fctx) {
    throw new Error("Canvas unsupported");
  }
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = "high";
  drawTransformedImage(fctx, img, tw, th, rotationDeg, flipH, flipV);

  const c = crop ? clampCropToTransformed(crop, tw, th) : { x: 0, y: 0, w: tw, h: th };
  const outW = Math.max(1, Math.round(targetWidth ?? c.w));
  const outH = Math.max(1, Math.round(targetHeight ?? c.h));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) {
    throw new Error("Canvas unsupported");
  }
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(full, c.x, c.y, c.w, c.h, 0, 0, outW, outH);

  return out;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const finalize = (blob: Blob | null) => {
      if (blob) {
        resolve(blob);
        return;
      }

      // Some browsers return null for unsupported mimes (and occasionally for supported ones).
      // Fallback: try toDataURL and convert it to a Blob.
      try {
        const dataUrl = canvas.toDataURL(mime, quality);
        if (!dataUrl.startsWith(`data:${mime}`)) {
          reject(new Error(`Export failed (${mime} unsupported)`));
          return;
        }
        const comma = dataUrl.indexOf(",");
        const b64 = dataUrl.slice(comma + 1);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: mime }));
      } catch {
        reject(new Error(`Export failed (${mime})`));
      }
    };

    try {
      canvas.toBlob(finalize, mime, quality);
    } catch {
      finalize(null);
    }
  });
}
