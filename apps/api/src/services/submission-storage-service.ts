import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ENV, isSupabaseConfigured } from "../config/env.js";
import { getSupabaseAdmin } from "./supabase-service.js";
import { createSubmissionImagePublicUrl } from "./submission-repository.js";

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadLocalDevelopmentImage(
  submissionId: string,
  file: Express.Multer.File,
  safeExtension: string,
): Promise<{ storagePath: string; publicUrl: string | null }> {
  const safeSubmissionId = sanitizePathPart(submissionId);
  const fileName = `${randomUUID()}.${safeExtension}`;
  const baseDir = path.resolve(process.cwd(), ".local-dev", "submission-images");
  const submissionDir = path.join(baseDir, safeSubmissionId);

  await fs.mkdir(submissionDir, { recursive: true });
  await fs.writeFile(path.join(submissionDir, fileName), file.buffer);

  return {
    storagePath: `${safeSubmissionId}/${fileName}`,
    publicUrl: `http://localhost:${ENV.PORT}/api/local-submission-images/${encodeURIComponent(safeSubmissionId)}/${encodeURIComponent(fileName)}`,
  };
}

export async function uploadSubmissionImage(
  submissionId: string,
  file: Express.Multer.File,
): Promise<{ storagePath: string; publicUrl: string | null }> {
  const extension = path.extname(file.originalname || "").replace(".", "").toLowerCase() || "jpg";
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
  const storagePath = `${submissionId}/${randomUUID()}.${safeExtension}`;

  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return uploadLocalDevelopmentImage(submissionId, file, safeExtension);
  }

  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(ENV.SUPABASE_STORAGE_BUCKET).upload(storagePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    throw new Error(`IMAGE_UPLOAD_FAILED:${error.message}`);
  }

  return {
    storagePath,
    publicUrl: await createSubmissionImagePublicUrl(storagePath),
  };
}

