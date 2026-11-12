import { open, readdir } from "node:fs/promises";
import { join, relative, resolve, sep, extname } from "node:path";
import type { ArtFolder } from "./screen-saver.ts";

/*
 * The screen saver's paintings, read from the computer Almanac runs on
 * (server only). ART_FOLDER in .env.local names the folder that holds
 * General, Spring, Halloween and so on. The files are never copied or
 * changed: Almanac reads the list, and the picture route below hands out
 * a screen-sized copy (Next.js makes it once and keeps it).
 */

const PICTURE = new Set([".jpg", ".jpeg", ".png", ".webp"]);
/** How deep inside each folder pictures are found (General/Landscapes/x.jpg counts). */
const MAX_DEPTH = 3;
/** The list is read again after this long, so new files show up without a restart. */
const FRESH_MS = 60_000;

export type ArtList = { root: string | null; folders: ArtFolder[]; problem: string | null };

let cached: { at: number; list: ArtList } | null = null;

/** The art folder, from ART_FOLDER, or null when it isn't set. */
export function artRoot(): string | null {
  const raw = process.env.ART_FOLDER?.trim();
  return raw ? resolve(raw) : null;
}

async function picturesIn(dir: string, root: string, depth: number): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory() && depth < MAX_DEPTH) out.push(...(await picturesIn(full, root, depth + 1)));
    else if (e.isFile() && PICTURE.has(extname(e.name).toLowerCase())) out.push(relative(root, full).split(sep).join("/"));
  }
  return out.sort();
}

/** Every top-level folder in the art folder and the pictures in it. */
export async function listArt(): Promise<ArtList> {
  const root = artRoot();
  if (!root) return { root: null, folders: [], problem: "ART_FOLDER isn't set" };
  if (cached && cached.list.root === root && Date.now() - cached.at < FRESH_MS) return cached.list;
  let list: ArtList;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const folders: ArtFolder[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      folders.push({ name: e.name, files: await picturesIn(join(root, e.name), root, 1) });
    }
    folders.sort((a, b) => a.name.localeCompare(b.name));
    list = { root, folders, problem: null };
  } catch (e) {
    list = { root, folders: [], problem: (e as NodeJS.ErrnoException).code === "ENOENT" ? "The art folder isn't there" : (e as Error).message };
  }
  cached = { at: Date.now(), list };
  return list;
}

/** A picture's address on Almanac: /art/<its path, encoded>.jpg (ending in a picture type keeps sign-in checks off it). */
export function artSrc(file: string): string {
  const ext = extname(file).toLowerCase() === ".png" ? ".png" : extname(file).toLowerCase() === ".webp" ? ".webp" : ".jpg";
  return `/art/${Buffer.from(file, "utf8").toString("base64url")}${ext}`;
}

/** The full path of a picture from its address, only if it's really a picture inside the art folder. */
export function artPath(name: string): string | null {
  const root = artRoot();
  const m = /^([A-Za-z0-9_-]{1,900})\.(jpg|png|webp)$/.exec(name);
  if (!root || !m) return null;
  const file = Buffer.from(m[1], "base64url").toString("utf8");
  if (!PICTURE.has(extname(file).toLowerCase()) || file.includes("\0")) return null;
  const full = resolve(root, file);
  return full.startsWith(root + sep) ? full : null;
}

const sizes = new Map<string, { width: number; height: number } | null>();

/** A picture's width and height, read from the start of the file (JPEG, PNG or WebP). */
export async function pictureSize(file: string): Promise<{ width: number; height: number } | null> {
  if (sizes.has(file)) return sizes.get(file)!;
  const root = artRoot();
  if (!root) return null;
  let size: { width: number; height: number } | null = null;
  try {
    const handle = await open(resolve(root, file), "r");
    try {
      const buf = Buffer.alloc(512 * 1024);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      size = sizeFromBytes(buf.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch {
    size = null;
  }
  sizes.set(file, size);
  return size;
}

/** Reads the size from a picture's first bytes. Exported for tests. */
export function sizeFromBytes(b: Buffer): { width: number; height: number } | null {
  // PNG: the IHDR chunk comes first.
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // WebP
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG: walk the markers to the frame header (SOF0 to SOF15, not DHT/JPG/DAC).
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    }
    i += 2 + length;
  }
  return null;
}
