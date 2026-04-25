import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import * as UTIF from "utif";
import { encodeBmp32 } from "./encoders/bmp";
import {
  canvasRectToCrop,
  cropToCanvasRect,
  canvasToBlob,
  drawTransformedImage,
  drawTransformedImageScaled,
  fitTransformedRect,
  renderExportCanvas,
  transformedDimensions,
  type CropRect,
} from "./imagePipeline";

function normalizeRect(
  ax: number,
  ay: number,
  bx: number,
  by: number
): CropRect {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);
  return { x, y, w, h };
}

const ACCEPTED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".svg",
  ".tif",
  ".tiff",
  ".pdf",
] as const;

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "image/tiff",
  "application/pdf",
] as const;

function isSupportedFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return true;
  }
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function ImageEditor() {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [bitmap, setBitmap] = useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<"transform" | "crop" | "pan">("transform");
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
const [crop, setCrop] = useState<CropRect | null>(null);
  const [_draft, setDraft] = useState<CropRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizePercent, setResizePercent] = useState(100);
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  type ExportFormat =
    | "png"
    | "jpg"
    | "jpeg"
    | "webp"
    | "avif"
    | "gif"
    | "bmp"
    | "svg"
    | "tiff"
    | "pdf";
  const [exportFmt, setExportFmt] = useState<ExportFormat>("png");
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [webpQuality, setWebpQuality] = useState(0.92);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [showImageLoadingIndicator, setShowImageLoadingIndicator] = useState(false);
  const [renderingPreview, setRenderingPreview] = useState(false);
  const [showPreviewLoadingIndicator, setShowPreviewLoadingIndicator] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRenderTokenRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [canvasResizing, setCanvasResizing] = useState(false);
  const [panning, setPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [hoveringCorner, setHoveringCorner] = useState(false);
  const canvasResizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragModeRef = useRef<
    | null
    | {
        kind: "new";
        start: { x: number; y: number };
      }
    | {
        kind: "move";
        start: { x: number; y: number };
        startCrop: CropRect;
      }
    | {
        kind: "resize";
        handle:
          | "n"
          | "s"
          | "e"
          | "w"
          | "ne"
          | "nw"
          | "se"
          | "sw";
        start: { x: number; y: number };
        startCrop: CropRect;
        aspect: number | null;
      }
  >(null);

  const loadFile = useCallback((file: File | null) => {
    if (!file) {
      setError("Please choose a file.");
      return;
    }
    if (!isSupportedFile(file)) {
      setError(
        `Unsupported file type. Supported: ${ACCEPTED_EXTENSIONS.join(", ")}`
      );
      return;
    }
    setError(null);
    setLoadingImage(true);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!loadingImage) {
      setShowImageLoadingIndicator(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowImageLoadingIndicator(true);
    }, 150);
    return () => window.clearTimeout(timeoutId);
  }, [loadingImage]);

  useEffect(() => {
    if (!renderingPreview) {
      setShowPreviewLoadingIndicator(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowPreviewLoadingIndicator(true);
    }, 150);
    return () => window.clearTimeout(timeoutId);
  }, [renderingPreview]);

  useEffect(() => {
    if (!objectUrl) {
      setBitmap(null);
      setLoadingImage(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setBitmap(img);
      setMode("transform");
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setResizePercent(100);
      setTargetWidth(0);
      setTargetHeight(0);
      setCrop(null);
      setDraft(null);
      setLoadingImage(false);
    };
    img.onerror = () => {
      setLoadingImage(false);
      setError(
        "Could not load that file for preview/export in this browser. (PDF and some image formats may not be supported.)"
      );
    };
    img.src = objectUrl;
  }, [objectUrl]);

  useEffect(() => {
    setCrop(null);
    setDraft(null);
  }, [rotation, flipH, flipV]);

  const tw = bitmap
    ? transformedDimensions(bitmap.naturalWidth, bitmap.naturalHeight, rotation)
        .tw
    : 0;
  const th = bitmap
    ? transformedDimensions(bitmap.naturalWidth, bitmap.naturalHeight, rotation)
        .th
    : 0;
  const baseExportW = Math.round(crop ? crop.w : tw);
  const baseExportH = Math.round(crop ? crop.h : th);

  const aspectRatioDisplay = (() => {
    if (!baseExportW || !baseExportH) return null;
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const g = gcd(baseExportW, baseExportH);
    return `${baseExportW / g}:${baseExportH / g}`;
  })();

  useEffect(() => {
    if (!bitmap || tw === 0 || th === 0) return;
    setTargetWidth(baseExportW);
    setTargetHeight(baseExportH);
    setResizePercent(100);
  }, [bitmap, tw, th, baseExportW, baseExportH]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !bitmap || tw === 0 || th === 0) {
      setRenderingPreview(false);
      return;
    }

    const token = previewRenderTokenRef.current + 1;
    previewRenderTokenRef.current = token;
    setRenderingPreview(true);
    const rafId = window.requestAnimationFrame(() => {
      if (previewRenderTokenRef.current !== token) return;
      const outW = Math.max(1, targetWidth || baseExportW || tw);
      const outH = Math.max(1, targetHeight || baseExportH || th);

      // Calculate preview size at correct aspect ratio, max 400px to fit preview area
      const maxPreview = 400;
      const aspectRatio = outW / outH;
      let pw: number, ph: number;
      if (aspectRatio >= 1) {
        pw = Math.min(outW, maxPreview);
        ph = Math.round(pw / aspectRatio);
      } else {
        ph = Math.min(outH, maxPreview);
        pw = Math.round(ph * aspectRatio);
      }
      pw = Math.max(1, pw);
      ph = Math.max(1, ph);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(pw * dpr);
      canvas.height = Math.round(ph * dpr);
      canvas.style.width = `${pw}px`;
      canvas.style.height = `${ph}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setRenderingPreview(false);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, pw, ph);

      // Render a reduced-resolution transformed frame, then crop and scale into preview.
      const maxFrame = 900; // keeps preview snappy on large images
      const frameScale = Math.min(1, maxFrame / Math.max(tw, th));
      const fw = Math.max(1, Math.round(tw * frameScale));
      const fh = Math.max(1, Math.round(th * frameScale));
      const frame = document.createElement("canvas");
      frame.width = fw;
      frame.height = fh;
      const fctx = frame.getContext("2d");
      if (!fctx) {
        setRenderingPreview(false);
        return;
      }
      drawTransformedImage(fctx, bitmap, fw, fh, rotation, flipH, flipV);

      const srcCrop = crop
        ? {
            x: crop.x * frameScale,
            y: crop.y * frameScale,
            w: crop.w * frameScale,
            h: crop.h * frameScale,
          }
        : { x: 0, y: 0, w: fw, h: fh };

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        frame,
        srcCrop.x,
        srcCrop.y,
        srcCrop.w,
        srcCrop.h,
        0,
        0,
        pw,
        ph
      );
      setRenderingPreview(false);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (previewRenderTokenRef.current === token) {
        setRenderingPreview(false);
      }
    };
  }, [
    bitmap,
    rotation,
    flipH,
    flipV,
    crop,
    targetWidth,
    targetHeight,
    baseExportW,
    baseExportH,
    tw,
    th,
  ]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      setViewport({ w: wrap.clientWidth, h: wrap.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const { w, h } = viewport;
    if (!canvas || !bitmap || tw === 0 || w < 2 || h < 2) return;

    // Use target dimensions if set, otherwise use base export dimensions
    const outW = targetWidth || baseExportW;
    const outH = targetHeight || baseExportH;

    // Calculate display dimensions fitting in viewport while keeping aspect ratio
    const displayW = Math.min(w, outW);
    const displayH = Math.min(h, outH);
    const scale = Math.min(displayW / outW, displayH / outH, 1);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Calculate image display rect (centered in canvas)
    const drawnW = Math.max(1, Math.round(outW * scale));
    const drawnH = Math.max(1, Math.round(outH * scale));
    const ox = Math.round((w - drawnW) / 2);
    const oy = Math.round((h - drawnH) / 2);

    // Draw the transformed and cropped image at target dimensions
    drawTransformedImageScaled(ctx, bitmap, outW, outH, rotation, flipH, flipV, crop, scale, ox, oy, drawnW, drawnH, panOffset.x, panOffset.y);

    // Draw output bounds rectangle
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(ox + 0.5, oy + 0.5, drawnW - 1, drawnH - 1);

    // Draw resize handle in bottom-right corner
    if (bitmap) {
      const handleSize = 12;
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = "rgba(30, 64, 175, 0.9)";
      ctx.lineWidth = 2;

      // Corner box
      ctx.fillRect(ox + drawnW - handleSize, oy + drawnH - handleSize, handleSize, handleSize);
      ctx.strokeRect(ox + drawnW - handleSize, oy + drawnH - handleSize, handleSize, handleSize);

      // Dimension labels
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillText(`${outW}×${outH}`, ox + drawnW - handleSize - 8, oy - 6);
    }

    // Draw crop rect if exists
    if (crop && baseExportW > 0 && baseExportH > 0) {
      const cropX = ox + (crop.x / outW) * drawnW;
      const cropY = oy + (crop.y / outH) * drawnH;
      const cropW = (crop.w / outW) * drawnW;
      const cropH = (crop.h / outH) * drawnH;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(100, 200, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX + 0.5, cropY + 0.5, cropW - 1, cropH - 1);
    }

    ctx.restore();
  }, [viewport, bitmap, rotation, flipH, flipV, crop, tw, th, targetWidth, targetHeight, baseExportW, baseExportH, panOffset]);

  const overlayPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el || !bitmap) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return { x, y };
  };

  const clampToImageBounds = (point: { x: number; y: number }) => {
    if (!tw || !th) return point;
    const w = viewport.w || wrapRef.current?.clientWidth || 0;
    const h = viewport.h || wrapRef.current?.clientHeight || 0;
    const layout = fitTransformedRect(w, h, tw, th);
    const x = Math.max(layout.ox, Math.min(layout.ox + layout.drawnW, point.x));
    const y = Math.max(layout.oy, Math.min(layout.oy + layout.drawnH, point.y));
    return { x, y };
  };

  const getLayout = () => {
    const w = viewport.w || wrapRef.current?.clientWidth || 0;
    const h = viewport.h || wrapRef.current?.clientHeight || 0;
    return { w, h, layout: fitTransformedRect(w, h, tw, th) };
  };

  const hitTestHandle = (p: { x: number; y: number }) => {
    if (!crop || !tw || !th) return null;
    const { layout } = getLayout();
    const cr = cropToCanvasRect(crop, layout, tw, th);
    const pad = 10;
    const inside =
      p.x >= cr.x + pad &&
      p.x <= cr.x + cr.w - pad &&
      p.y >= cr.y + pad &&
      p.y <= cr.y + cr.h - pad;
    const near = (ax: number, ay: number) =>
      Math.abs(p.x - ax) <= pad && Math.abs(p.y - ay) <= pad;
    const nearH = (ay: number) => Math.abs(p.y - ay) <= pad;
    const nearV = (ax: number) => Math.abs(p.x - ax) <= pad;

    const left = cr.x;
    const right = cr.x + cr.w;
    const top = cr.y;
    const bottom = cr.y + cr.h;
    const midX = cr.x + cr.w / 2;
    const midY = cr.y + cr.h / 2;

    if (near(left, top)) return { kind: "resize" as const, handle: "nw" as const };
    if (near(right, top)) return { kind: "resize" as const, handle: "ne" as const };
    if (near(left, bottom)) return { kind: "resize" as const, handle: "sw" as const };
    if (near(right, bottom)) return { kind: "resize" as const, handle: "se" as const };
    if (near(midX, top) && p.x >= left && p.x <= right) return { kind: "resize" as const, handle: "n" as const };
    if (near(midX, bottom) && p.x >= left && p.x <= right) return { kind: "resize" as const, handle: "s" as const };
    if (near(left, midY) && p.y >= top && p.y <= bottom) return { kind: "resize" as const, handle: "w" as const };
    if (near(right, midY) && p.y >= top && p.y <= bottom) return { kind: "resize" as const, handle: "e" as const };
    if (inside) return { kind: "move" as const };
    if (
      nearV(left) &&
      p.y >= top - pad &&
      p.y <= bottom + pad
    )
      return { kind: "resize" as const, handle: "w" as const };
    if (
      nearV(right) &&
      p.y >= top - pad &&
      p.y <= bottom + pad
    )
      return { kind: "resize" as const, handle: "e" as const };
    if (
      nearH(top) &&
      p.x >= left - pad &&
      p.x <= right + pad
    )
      return { kind: "resize" as const, handle: "n" as const };
    if (
      nearH(bottom) &&
      p.x >= left - pad &&
      p.x <= right + pad
    )
      return { kind: "resize" as const, handle: "s" as const };
    return null;
  };

  const setCropFromCanvasRect = (rect: CropRect) => {
    const { layout } = getLayout();
    setCrop(canvasRectToCrop(rect, layout, tw, th));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Handle canvas corner resize with Command key
    if (bitmap && (e.metaKey || e.ctrlKey)) {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const outW = targetWidth || baseExportW;
      const outH = targetHeight || baseExportH;
      const scale = Math.min(viewport.w / outW, viewport.h / outH, 1);
      const drawnW = Math.max(1, Math.round(outW * scale));
      const drawnH = Math.max(1, Math.round(outH * scale));
      const ox = (viewport.w - drawnW) / 2;
      const oy = (viewport.h - drawnH) / 2;
      const handleSize = 16;
      const cx = ox + drawnW - handleSize / 2;
      const cy = oy + drawnH - handleSize / 2;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // Check if clicking near corner handle
      if (px >= cx - handleSize && px <= cx + handleSize && py >= cy - handleSize && py <= cy + handleSize) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch { /* ignore */ }
        canvasResizeStartRef.current = { x: e.clientX, y: e.clientY, w: outW, h: outH };
        setCanvasResizing(true);
        return;
      }
    }

    // Handle Pan mode
    if (bitmap && mode === "pan") {
      const el = wrapRef.current;
      if (!el) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch { /* ignore */ }
      const raw = overlayPointer(e);
      const p = raw || undefined;
      if (!p) return;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
      setPanning(true);
      return;
    }

    if (!bitmap || mode !== "crop") return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const raw = overlayPointer(e);
    const p = raw ? clampToImageBounds(raw) : undefined;
    if (!p) return;

    const hit = hitTestHandle(p);
    if (hit?.kind === "move" && crop) {
      dragModeRef.current = { kind: "move", start: p, startCrop: crop };
      setDragging(true);
      setDraft(null);
      return;
    }
    if (hit?.kind === "resize" && crop) {
      dragModeRef.current = {
        kind: "resize",
        handle: hit.handle,
        start: p,
        startCrop: crop,
        aspect: lockAspect && crop.h > 0 ? crop.w / crop.h : null,
      };
      setDragging(true);
      setDraft(null);
      return;
    }

    dragModeRef.current = { kind: "new", start: p };
    dragStartRef.current = p;
    setDragging(true);
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Handle hover detection for corner handle
    if (bitmap) {
      const el = wrapRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const outW = targetWidth || baseExportW;
        const outH = targetHeight || baseExportH;
        const scale = Math.min(viewport.w / outW, viewport.h / outH, 1);
        const drawnW = Math.max(1, Math.round(outW * scale));
        const drawnH = Math.max(1, Math.round(outH * scale));
        const ox = (viewport.w - drawnW) / 2;
        const oy = (viewport.h - drawnH) / 2;
        const handleSize = 20;
        const cx = ox + drawnW - handleSize / 2;
        const cy = oy + drawnH - handleSize / 2;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const nearCorner = px >= cx - handleSize && px <= cx + handleSize && py >= cy - handleSize && py <= cy + handleSize;
        setHoveringCorner(nearCorner);
      }
    }

    // Handle panning
    if (panning && panStartRef.current && mode === "pan") {
      const start = panStartRef.current;
      const outW = targetWidth || baseExportW;
      const outH = targetHeight || baseExportH;
      const displayScale = Math.min(viewport.w / outW, viewport.h / outH, 1);

      const dx = (e.clientX - start.x) / displayScale;
      const dy = (e.clientY - start.y) / displayScale;

      const maxPanX = Math.max(0, (outW - tw) / 2);
      const maxPanY = Math.max(0, (outH - th) / 2);

      const newPanX = Math.max(-maxPanX, Math.min(maxPanX, start.panX + dx));
      const newPanY = Math.max(-maxPanY, Math.min(maxPanY, start.panY + dy));

      setPanOffset({ x: newPanX, y: newPanY });
      return;
    }

    // Handle canvas resize with Command+drag
    if (canvasResizing && canvasResizeStartRef.current) {
      const start = canvasResizeStartRef.current;
      const dx = (e.clientX - start.x);
      const dy = (e.clientY - start.y);

      // Calculate new dimensions based on drag
      let newW = start.w + dx;
      let newH = start.h + dy;

      // Clamp minimum size
      newW = Math.max(10, newW);
      newH = Math.max(10, newH);

      // Lock aspect ratio if enabled
      if (lockAspect && start.w > 0 && start.h > 0) {
        const aspect = start.w / start.h;
        if (Math.abs(dx) >= Math.abs(dy)) {
          newH = Math.round(newW / aspect);
        } else {
          newW = Math.round(newH * aspect);
        }
      }

      setTargetWidth(newW);
      setTargetHeight(newH);
      setResizePercent(Math.round((newW / baseExportW) * 100));
      return;
    }

    if (!dragging || !dragStartRef.current || mode !== "crop") return;
    const raw = overlayPointer(e);
    const p = raw ? clampToImageBounds(raw) : undefined;
    if (!p) return;
    const dm = dragModeRef.current;
    if (!dm) return;

    if (dm.kind === "new") {
      const s = dm.start;
      setDraft(normalizeRect(s.x, s.y, p.x, p.y));
      return;
    }

    // Move/resize update crop immediately (no draft)
    if (dm.kind === "move") {
      const { w, h, layout } = getLayout();
      const startCanvas = cropToCanvasRect(dm.startCrop, layout, tw, th);
      const dx = p.x - dm.start.x;
      const dy = p.y - dm.start.y;
      const moved: CropRect = {
        x: startCanvas.x + dx,
        y: startCanvas.y + dy,
        w: startCanvas.w,
        h: startCanvas.h,
      };
      // Clamp move within image bounds
      const minX = layout.ox;
      const minY = layout.oy;
      const maxX = layout.ox + layout.drawnW - moved.w;
      const maxY = layout.oy + layout.drawnH - moved.h;
      const clamped: CropRect = {
        x: Math.max(minX, Math.min(maxX, moved.x)),
        y: Math.max(minY, Math.min(maxY, moved.y)),
        w: moved.w,
        h: moved.h,
      };
      void w; void h;
      setCropFromCanvasRect(clamped);
      return;
    }

    if (dm.kind === "resize") {
      const { layout } = getLayout();
      const startCanvas = cropToCanvasRect(dm.startCrop, layout, tw, th);
      const left = startCanvas.x;
      const top = startCanvas.y;
      const right = startCanvas.x + startCanvas.w;
      const bottom = startCanvas.y + startCanvas.h;

      let nl = left;
      let nr = right;
      let nt = top;
      let nb = bottom;

      const applyAspect = (aspect: number) => {
        const w = nr - nl;
        const h = nb - nt;
        if (w <= 1 || h <= 1) return;
        const desiredH = w / aspect;
        const desiredW = h * aspect;
        // Prefer adjusting the axis opposite the dragged handle.
        if (dm.handle === "n" || dm.handle === "s") {
          // width fixed, adjust height
          const midY = (nt + nb) / 2;
          nt = midY - desiredH / 2;
          nb = midY + desiredH / 2;
        } else if (dm.handle === "e" || dm.handle === "w") {
          const midX = (nl + nr) / 2;
          nl = midX - desiredW / 2;
          nr = midX + desiredW / 2;
        } else {
          // corner: keep anchor opposite corner, adjust the other side
          if (dm.handle === "nw") {
            nt = nb - desiredH;
            nl = nr - w;
          } else if (dm.handle === "ne") {
            nt = nb - desiredH;
            nr = nl + w;
          } else if (dm.handle === "sw") {
            nb = nt + desiredH;
            nl = nr - w;
          } else if (dm.handle === "se") {
            nb = nt + desiredH;
            nr = nl + w;
          }
        }
      };

      if (dm.handle.includes("w")) nl = p.x;
      if (dm.handle.includes("e")) nr = p.x;
      if (dm.handle.includes("n")) nt = p.y;
      if (dm.handle.includes("s")) nb = p.y;

      // Normalize
      if (nr < nl) [nl, nr] = [nr, nl];
      if (nb < nt) [nt, nb] = [nb, nt];

      // Enforce minimum size
      const minSize = 8;
      if (nr - nl < minSize) nr = nl + minSize;
      if (nb - nt < minSize) nb = nt + minSize;

      // Aspect lock
      if (dm.aspect) applyAspect(dm.aspect);

      // Clamp within image bounds
      const minX = layout.ox;
      const minY = layout.oy;
      const maxX = layout.ox + layout.drawnW;
      const maxY = layout.oy + layout.drawnH;
      nl = Math.max(minX, Math.min(maxX - minSize, nl));
      nt = Math.max(minY, Math.min(maxY - minSize, nt));
      nr = Math.max(nl + minSize, Math.min(maxX, nr));
      nb = Math.max(nt + minSize, Math.min(maxY, nb));

      setCropFromCanvasRect({ x: nl, y: nt, w: nr - nl, h: nb - nt });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // Handle canvas resize end
    if (canvasResizing) {
      setCanvasResizing(false);
      canvasResizeStartRef.current = null;
      return;
    }

    // Handle panning end
    if (panning) {
      setPanning(false);
      panStartRef.current = null;
      return;
    }

    if (!dragging || !bitmap || mode !== "crop") {
      setDragging(false);
      dragStartRef.current = null;
      setDraft(null);
      return;
    }
    const w = viewport.w || wrapRef.current?.clientWidth || 0;
    const h = viewport.h || wrapRef.current?.clientHeight || 0;
    const layout = fitTransformedRect(w, h, tw, th);
    const raw = overlayPointer(e);
    const p = raw ? clampToImageBounds(raw) : undefined;
    const s = dragStartRef.current;
    setDragging(false);
    dragStartRef.current = null;
    const dm = dragModeRef.current;
    dragModeRef.current = null;
    if (dm?.kind !== "new") {
      setDraft(null);
      return;
    }
    if (p && s) {
      const norm = normalizeRect(s.x, s.y, p.x, p.y);
      if (norm.w > 4 && norm.h > 4) {
        setCrop(canvasRectToCrop(norm, layout, tw, th));
      }
    }
    setDraft(null);
  };

  const updateResizePercent = (percent: number) => {
    const safe = Math.max(10, Math.min(400, percent));
    setResizePercent(safe);
    setTargetWidth(Math.max(1, Math.round((baseExportW * safe) / 100)));
    setTargetHeight(Math.max(1, Math.round((baseExportH * safe) / 100)));
  };

  const onTargetWidthChange = (value: number) => {
    const w = Math.max(1, value || 1);
    setTargetWidth(w);
    if (lockAspect && baseExportW > 0) {
      const h = Math.max(1, Math.round((w / baseExportW) * baseExportH));
      setTargetHeight(h);
      setResizePercent(Math.max(10, Math.min(400, Math.round((w / baseExportW) * 100))));
    }
  };

  const onTargetHeightChange = (value: number) => {
    const h = Math.max(1, value || 1);
    setTargetHeight(h);
    if (lockAspect && baseExportH > 0) {
      const w = Math.max(1, Math.round((h / baseExportH) * baseExportW));
      setTargetWidth(w);
      setResizePercent(Math.max(10, Math.min(400, Math.round((h / baseExportH) * 100))));
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    // Safari/iOS can require the node to be in the DOM.
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke later so the download has time to start.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const supportsCanvasMime = (mime: string) => {
    try {
      const c = document.createElement("canvas");
      const url = c.toDataURL(mime);
      return url.startsWith(`data:${mime}`);
    } catch {
      return false;
    }
  };

  const onDownload = async () => {
    if (!bitmap) return;
    setExporting(true);
    setError(null);
    try {
      const canvas = renderExportCanvas(
        bitmap,
        rotation,
        flipH,
        flipV,
        crop,
        targetWidth,
        targetHeight,
      );

      const baseName = "edited";
      if (exportFmt === "png") {
        downloadBlob(await canvasToBlob(canvas, "image/png"), `${baseName}.png`);
      } else if (exportFmt === "jpg" || exportFmt === "jpeg") {
        downloadBlob(
          await canvasToBlob(canvas, "image/jpeg", jpegQuality),
          `${baseName}.jpg`
        );
      } else if (exportFmt === "webp") {
        if (!supportsCanvasMime("image/webp")) {
          throw new Error("WEBP export not supported in this browser.");
        }
        downloadBlob(
          await canvasToBlob(canvas, "image/webp", webpQuality),
          `${baseName}.webp`
        );
      } else if (exportFmt === "avif") {
        if (!supportsCanvasMime("image/avif")) {
          throw new Error("AVIF export not supported in this browser.");
        }
        downloadBlob(await canvasToBlob(canvas, "image/avif"), `${baseName}.avif`);
      } else if (exportFmt === "bmp") {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unsupported");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        downloadBlob(
          new Blob([encodeBmp32(imgData.data, canvas.width, canvas.height)], {
            type: "image/bmp",
          }),
          `${baseName}.bmp`
        );
      } else if (exportFmt === "gif") {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unsupported");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const palette = quantize(imgData.data, 256);
        const index = applyPalette(imgData.data, palette);
        const enc = GIFEncoder();
        enc.writeFrame(index, canvas.width, canvas.height, { palette, delay: 0 });
        enc.finish();
        downloadBlob(
          new Blob([enc.bytes()], { type: "image/gif" }),
          `${baseName}.gif`
        );
      } else if (exportFmt === "tiff") {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unsupported");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const ifd = UTIF.encodeImage(imgData.data, canvas.width, canvas.height);
        const tiff = UTIF.encode([ifd]);
        downloadBlob(new Blob([tiff], { type: "image/tiff" }), `${baseName}.tiff`);
      } else if (exportFmt === "svg") {
        // SVG wrapper that embeds the rendered output as a PNG image (keeps appearance exact).
        const pngBlob = await canvasToBlob(canvas, "image/png");
        const pngArray = new Uint8Array(await pngBlob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < pngArray.length; i++) binary += String.fromCharCode(pngArray[i]);
        const b64 = btoa(binary);
        const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">\n  <image width="${canvas.width}" height="${canvas.height}" href="data:image/png;base64,${b64}" />\n</svg>\n`;
        downloadBlob(
          new Blob([svg], { type: "image/svg+xml" }),
          `${baseName}.svg`
        );
      } else if (exportFmt === "pdf") {
        // Single-page PDF that embeds a JPEG raster.
        const jpgBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        const pdf = await PDFDocument.create();
        const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
        const jpg = await pdf.embedJpg(jpgBytes);
        const page = pdf.addPage([canvas.width, canvas.height]);
        page.drawImage(jpg, { x: 0, y: 0, width: canvas.width, height: canvas.height });
        const pdfBytes = await pdf.save();
        downloadBlob(
          new Blob([pdfBytes], { type: "application/pdf" }),
          `${baseName}.pdf`
        );
      } else {
        throw new Error("Unsupported export format.");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Export failed (unknown error).";
      setError(msg);
    } finally {
      setExporting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    loadFile(f ?? null);
  };

  return (
    <div className="row g-4 editor-layout">
      <div className="col-lg-7">
        <div
          ref={wrapRef}
          className="position-relative bg-dark rounded-4 overflow-hidden border border-secondary editor-stage"
          style={{ minHeight: "min(60vh, 520px)", aspectRatio: "4 / 3" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <canvas
            ref={canvasRef}
            className="d-block w-100 h-100"
            style={{
              position: "absolute",
              inset: 0,
              touchAction: "none",
            }}
          />
          <div
            className="position-absolute top-0 start-0 w-100 h-100"
            style={{
              cursor: canvasResizing || hoveringCorner ? "nwse-resize" : (panning ? "grabbing" : (bitmap && mode === "pan" ? "grab" : (bitmap && mode === "crop" ? "crosshair" : "default"))),
              touchAction: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {!bitmap && (
            <div className="position-absolute top-50 start-50 translate-middle text-center text-white-50 px-3">
              <p className="mb-2">Drop an image here or use Open file.</p>
              <p className="small mb-0">Then drag on the preview to crop.</p>
            </div>
          )}
          {showImageLoadingIndicator && (
            <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-50 text-white">
              <div className="text-center px-3" style={{ minWidth: "min(80%, 320px)" }}>
                <p className="small mb-2">Loading image...</p>
                <div className="progress" role="status" aria-label="Loading image">
                  <div
                    className="progress-bar progress-bar-striped progress-bar-animated"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="col-lg-5">
        <div className="card shadow-sm border-0 bg-body-tertiary editor-card">
          <div className="card-body">
            <h2 className="h5 card-title mb-3">Controls</h2>

            {error && (
              <div className="alert alert-warning py-2 small mb-3" role="alert">
                {error}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small text-secondary mb-1">
                Image
              </label>
              <input
                type="file"
                accept={[
                  ...ACCEPTED_MIME_TYPES,
                  ...ACCEPTED_EXTENSIONS,
                ].join(",")}
                className="form-control form-control-sm"
                onChange={(e) => loadFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="mb-3">
              <span className="form-label small text-secondary d-block mb-2">
                Edit mode
              </span>
              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  className={`btn btn-sm ${
                    mode === "transform" ? "btn-primary" : "btn-outline-primary"
                  }`}
                  disabled={!bitmap}
                  onClick={() => setMode("transform")}
                >
                  Transform
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    mode === "pan" ? "btn-primary" : "btn-outline-primary"
                  }`}
                  disabled={!bitmap}
                  onClick={() => setMode("pan")}
                >
                  Move
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    mode === "crop" ? "btn-primary" : "btn-outline-primary"
                  }`}
                  disabled={!bitmap}
                  onClick={() => setMode("crop")}
                >
                  Crop
                </button>
              </div>
            </div>

            <div className="mb-3">
              <span className="form-label small text-secondary d-block mb-2">
                Transform
              </span>
              <div className="btn-group flex-wrap" role="group">
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  disabled={!bitmap || mode !== "transform"}
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                >
                  Rotate 90°
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  disabled={!bitmap || mode !== "transform"}
                  onClick={() => setFlipH((v) => !v)}
                >
                  Flip H
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  disabled={!bitmap || mode !== "transform"}
                  onClick={() => setFlipV((v) => !v)}
                >
                  Flip V
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap || mode !== "transform"}
                  onClick={() => {
                    setRotation(0);
                    setFlipH(false);
                    setFlipV(false);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                >
                  Reset transform
                </button>
              </div>
            </div>

            <div className="mb-3">
              <span className="form-label small text-secondary d-block mb-2">
                Crop
              </span>
              <p className="form-text small mb-2">
                Switch to Crop mode, then drag on preview to select.
              </p>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={!bitmap || !crop}
                onClick={() => setCrop(null)}
              >
                Clear crop
              </button>
            </div>

            <div className="mb-3">
              <span className="form-label small text-secondary d-block mb-2">
                Resize output
              </span>
              <div className="d-flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap}
                  onClick={() => updateResizePercent(50)}
                >
                  50%
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap}
                  onClick={() => updateResizePercent(100)}
                >
                  100%
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap}
                  onClick={() => updateResizePercent(200)}
                >
                  200%
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm ms-auto"
                  disabled={!bitmap}
                  onClick={() => {
                    setLockAspect(true);
                    updateResizePercent(100);
                  }}
                >
                  Reset resize
                </button>
              </div>
              <label className="form-label small mb-1">
                Scale ({resizePercent}%)
              </label>
              <input
                type="range"
                className="form-range"
                min={10}
                max={400}
                step={1}
                value={resizePercent}
                disabled={!bitmap}
                onChange={(e) => updateResizePercent(Number.parseInt(e.target.value, 10))}
              />
              <div className="row g-2">
                <div className="col">
                  <label className="form-label small mb-1">Width</label>
                  <input
                    type="number"
                    min={1}
                    className="form-control form-control-sm"
                    value={targetWidth || ""}
                    disabled={!bitmap}
                    onChange={(e) => onTargetWidthChange(Number.parseInt(e.target.value, 10))}
                  />
                </div>
                <div className="col">
                  <label className="form-label small mb-1">Height</label>
                  <input
                    type="number"
                    min={1}
                    className="form-control form-control-sm"
                    value={targetHeight || ""}
                    disabled={!bitmap}
                    onChange={(e) => onTargetHeightChange(Number.parseInt(e.target.value, 10))}
                  />
                </div>
              </div>
              <div className="d-flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap}
                  onClick={() => {
                    setLockAspect(true);
                    onTargetWidthChange(1080);
                  }}
                >
                  1080w
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap}
                  onClick={() => {
                    setLockAspect(true);
                    onTargetWidthChange(1920);
                  }}
                >
                  1920w
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={!bitmap}
                  onClick={() => {
                    setLockAspect(true);
                    onTargetWidthChange(3840);
                  }}
                >
                  4K w
                </button>
              </div>
              <div className="form-check mt-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="lock-aspect"
                  checked={lockAspect}
                  onChange={(e) => setLockAspect(e.target.checked)}
                />
                <label className="form-check-label small" htmlFor="lock-aspect">
                  Lock aspect ratio
                </label>
              </div>
            </div>

            <div className="mb-3">
              <span className="form-label small text-secondary d-block mb-2">
                Output preview
              </span>
              <div className="border rounded-3 p-2 bg-dark-subtle position-relative preview-shell">
                <div className="d-flex justify-content-center">
                  <canvas
                    ref={previewCanvasRef}
                    className="d-block rounded"
                    style={{ maxWidth: "100%", height: "auto" }}
                  />
                </div>
                {showPreviewLoadingIndicator && bitmap && (
                  <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-3 bg-body bg-opacity-75">
                    <div className="text-center px-3" style={{ minWidth: "min(80%, 240px)" }}>
                      <p className="small mb-2">Rendering preview...</p>
                      <div className="progress" role="status" aria-label="Rendering preview">
                        <div
                          className="progress-bar progress-bar-striped progress-bar-animated"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <p className="small text-secondary mt-2 mb-0">
                  Output: {targetWidth || baseExportW}×{targetHeight || baseExportH}px
                  {crop ? ` · Crop ${Math.round(crop.w)}×${Math.round(crop.h)}px` : ""}
                  {aspectRatioDisplay ? ` · ${aspectRatioDisplay}` : ""}
                </p>
              </div>
            </div>

            <hr className="border-secondary-subtle" />

            <div className="mb-2">
              <label className="form-label small text-secondary mb-1">
                Export format
              </label>
              <select
                className="form-select form-select-sm"
                value={exportFmt}
                onChange={(e) => setExportFmt(e.target.value as ExportFormat)}
              >
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WEBP</option>
                <option value="avif">AVIF</option>
                <option value="gif">GIF</option>
                <option value="bmp">BMP</option>
                <option value="svg">SVG (embedded PNG)</option>
                <option value="tiff">TIFF</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            {(exportFmt === "jpg" || exportFmt === "jpeg") && (
              <div className="mb-3">
                <label className="form-label small text-secondary mb-1">
                  JPEG quality ({Math.round(jpegQuality * 100)}%)
                </label>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={jpegQuality}
                  onChange={(e) =>
                    setJpegQuality(Number.parseFloat(e.target.value))
                  }
                />
              </div>
            )}

            {exportFmt === "webp" && (
              <div className="mb-3">
                <label className="form-label small text-secondary mb-1">
                  WEBP quality ({Math.round(webpQuality * 100)}%)
                </label>
                <input
                  type="range"
                  className="form-range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={webpQuality}
                  onChange={(e) =>
                    setWebpQuality(Number.parseFloat(e.target.value))
                  }
                />
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary w-100"
              disabled={!bitmap || exporting}
              onClick={onDownload}
            >
              {exporting ? "Exporting…" : "Download result"}
            </button>

            {bitmap && (
              <p className="small text-secondary mt-3 mb-0">
                Source {bitmap.naturalWidth}×{bitmap.naturalHeight}px ·
                Transformed frame {Math.round(tw)}×{Math.round(th)}px
                {crop
                  ? ` · Crop ${Math.round(crop.w)}×${Math.round(crop.h)}px`
                  : ""}
                {targetWidth > 0 && targetHeight > 0
                  ? ` · Output ${targetWidth}×${targetHeight}px`
                  : ""}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
