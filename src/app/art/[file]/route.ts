import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { artPath } from "@/lib/art-folder";

/*
 * One painting from the art folder, for the screen saver. The address
 * ends in .jpg so the sign-in check skips it, which lets Next.js's picture
 * resizer fetch it and keep a screen-sized copy. It only ever hands out
 * picture files inside ART_FOLDER (public domain paintings).
 */

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: NextRequest, ctx: RouteContext<"/art/[file]">) {
  const { file } = await ctx.params;
  const full = artPath(file);
  if (!full) return new Response("Not here.", { status: 404 });
  try {
    const info = await stat(full);
    if (!info.isFile()) return new Response("Not here.", { status: 404 });
    const ext = full.slice(full.lastIndexOf(".") + 1).toLowerCase();
    const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not here.", { status: 404 });
  }
}
