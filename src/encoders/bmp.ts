export function encodeBmp32(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  // 32-bit BGRA, bottom-up rows (standard BMP).
  const bytesPerPixel = 4;
  const rowStride = width * bytesPerPixel;
  const pixelDataSize = rowStride * height;
  const headerSize = 14 + 40; // FILE + BITMAPINFOHEADER
  const fileSize = headerSize + pixelDataSize;

  const out = new Uint8Array(fileSize);
  const dv = new DataView(out.buffer);

  // BITMAPFILEHEADER (14 bytes)
  dv.setUint8(0, 0x42); // 'B'
  dv.setUint8(1, 0x4d); // 'M'
  dv.setUint32(2, fileSize, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, 0, true);
  dv.setUint32(10, headerSize, true);

  // BITMAPINFOHEADER (40 bytes)
  dv.setUint32(14, 40, true); // biSize
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true); // positive => bottom-up
  dv.setUint16(26, 1, true); // planes
  dv.setUint16(28, 32, true); // bpp
  dv.setUint32(30, 0, true); // BI_RGB (no compression)
  dv.setUint32(34, pixelDataSize, true);
  dv.setInt32(38, 2835, true); // 72 DPI
  dv.setInt32(42, 2835, true);
  dv.setUint32(46, 0, true);
  dv.setUint32(50, 0, true);

  // Pixel data: BMP is BGRA, bottom row first
  let offset = headerSize;
  for (let y = height - 1; y >= 0; y--) {
    const srcRow = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = srcRow + x * 4;
      const r = rgba[i + 0];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3];
      out[offset++] = b;
      out[offset++] = g;
      out[offset++] = r;
      out[offset++] = a;
    }
  }

  return out;
}

