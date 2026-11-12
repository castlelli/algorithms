// Turns files into RGBA images. The C engine decodes everything it knows (PNG, JPEG, BMP, GIF, TGA,
// PSD, PNM, PXS, classic text); camera JPEGs are then turned upright with the C rotate and flip.
// Formats the engine does not read (WebP, AVIF, HEIC, SVG) fall back to the browser's decoder.

import { run } from "./engine.js";

const FORMAT_NAMES = ["image", "PNG", "JPEG", "BMP", "TGA", "PXS", "classic text"];

// EXIF orientation (1-8) of a JPEG, or 1.
function exifOrientation(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > bytes.length) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    offset += 2 + length;
  }
  return 1;
}

async function orient(image, orientation) {
  if (orientation <= 1 || orientation > 8) return image;
  let current = image;
  const flip = [2, 4, 5, 7].includes(orientation);
  const turns = { 3: 2, 4: 2, 5: 1, 6: 1, 7: 3, 8: 3 }[orientation] || 0;
  if (flip) current = (await run("flip", { image: current, horizontal: true })).result;
  if (turns) current = (await run("rotate", { image: current, degrees: turns * 90 })).result;
  return current;
}

async function browserDecode(bytes, type) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: type || "" }), { imageOrientation: "from-image" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close?.();
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer) };
}

// Returns { image, bytes, name, format, via, ms, sourceChannels }.
export async function decodeBytes(bytes, name = "image", type = "") {
  try {
    const { result, ms } = await run("decode", { bytes });
    const image = await orient({ width: result.width, height: result.height, data: result.data }, exifOrientation(bytes));
    return { image, bytes, name, format: FORMAT_NAMES[result.format] || "image", via: "C", ms, sourceChannels: result.sourceChannels };
  } catch (error) {
    try {
      const image = await browserDecode(bytes, type);
      const format = (type.split("/")[1] || name.split(".").pop() || "image").toUpperCase();
      return { image, bytes, name, format, via: "browser", ms: 0, sourceChannels: 4 };
    } catch {
      throw new Error(`Could not read ${name}: not an image format Pixelsmith or this browser understands.`);
    }
  }
}

export async function decodeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeBytes(bytes, file.name, file.type);
}

export async function decodeUrl(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${name}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeBytes(bytes, name, response.headers.get("content-type") || "");
}
