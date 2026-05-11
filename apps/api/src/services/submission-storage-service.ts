import { randomUUID } from "node:crypto";
import path from "node:path";
import { ENV } from "../config/env.js";
import { getSupabaseAdmin } from "./supabase-service.js";
import { createSubmissionImagePublicUrl } from "./submission-repository.js";

export async function uploadSubmissionImage(
  submissionId: string,
  file: Express.Multer.File,
): Promise<{ storagePath: string; publicUrl: string | null }> {
  const extension = path.extname(file.originalname || "").replace(".", "").toLowerCase() || "jpg";
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
  const storagePath = `${submissionId}/${randomUUID()}.${safeExtension}`;

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

