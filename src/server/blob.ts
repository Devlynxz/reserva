import "server-only";
import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { detectImageType } from "@/lib/image-type";
import { env } from "./env";

// Vercel Blob storage for admin-uploaded images. Optional: without BLOB_READ_WRITE_TOKEN
// the upload UI explains how to connect a store and nothing else changes.

export const MAX_LOGO_BYTES = 1024 * 1024;

export class UploadError extends Error {
  override name = "UploadError";
}

export function blobEnabled(): boolean {
  return Boolean(env().BLOB_READ_WRITE_TOKEN);
}

/** Validates (size, real image type) and stores a logo; returns its public URL. */
export async function uploadLogo(file: File): Promise<string> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) throw new UploadError("Photo storage isn't connected. Add a Vercel Blob store first.");
  if (file.size === 0) throw new UploadError("Choose an image file.");
  if (file.size > MAX_LOGO_BYTES) throw new UploadError("Use an image under 1 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) throw new UploadError("Use a PNG, JPEG or WebP image.");

  // Random, unguessable name; the extension and content type come from the bytes, not the upload.
  const blob = await put(`logos/logo-${randomBytes(8).toString("hex")}.${type.ext}`, Buffer.from(bytes), {
    access: "public",
    contentType: type.mime,
    token,
  });
  return blob.url;
}
