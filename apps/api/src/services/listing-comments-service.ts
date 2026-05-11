import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "../config/env.js";
import { getSupabaseAdmin } from "./supabase-service.js";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const COMMENTS_FILE = path.join(DATA_DIR, "listing-comments.json");
const MAX_COMMENTS_PER_LISTING = 80;

export interface ListingCommentRecord {
  readonly id: string;
  readonly listingId: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
}

interface StoredListingComment extends ListingCommentRecord {
  readonly authorId: string | null;
  readonly status: "visible" | "hidden";
}

function normalizeCommentRow(row: Record<string, unknown>): ListingCommentRecord {
  return {
    id: String(row.id),
    listingId: String(row.listing_id ?? row.listingId ?? ""),
    authorName: String(row.author_name ?? row.authorName ?? "Misafir"),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readLocalComments(): Promise<StoredListingComment[]> {
  try {
    const content = await fs.readFile(COMMENTS_FILE, "utf-8");
    const parsed = JSON.parse(content) as StoredListingComment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalComments(comments: readonly StoredListingComment[]): Promise<void> {
  await ensureDataDir();
  const tempPath = `${COMMENTS_FILE}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(comments, null, 2), "utf-8");
  await fs.rename(tempPath, COMMENTS_FILE);
}

export async function listListingComments(listingId: string): Promise<ListingCommentRecord[]> {
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_comments")
        .select("id, listing_id, author_name, body, created_at")
        .eq("listing_id", listingId)
        .eq("status", "visible")
        .order("created_at", { ascending: true })
        .limit(MAX_COMMENTS_PER_LISTING);

      if (!error) {
        return (data ?? []).map((row) => normalizeCommentRow(row as Record<string, unknown>));
      }
    } catch {
      // Local fallback keeps development usable before the Supabase table is applied.
    }
  }

  const comments = await readLocalComments();
  return comments
    .filter((comment) => comment.listingId === listingId && comment.status === "visible")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-MAX_COMMENTS_PER_LISTING);
}

export async function createListingComment(input: {
  readonly listingId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly body: string;
}): Promise<ListingCommentRecord> {
  const createdAt = new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_comments")
        .insert({
          listing_id: input.listingId,
          author_id: input.authorId,
          author_name: input.authorName,
          body: input.body,
          status: "visible",
          created_at: createdAt,
        })
        .select("id, listing_id, author_name, body, created_at")
        .single();

      if (!error && data) {
        return normalizeCommentRow(data as Record<string, unknown>);
      }
    } catch {
      // Local fallback keeps development usable before the Supabase table is applied.
    }
  }

  const nextComment: StoredListingComment = {
    id: randomUUID(),
    listingId: input.listingId,
    authorId: input.authorId,
    authorName: input.authorName,
    body: input.body,
    createdAt,
    status: "visible",
  };
  const comments = await readLocalComments();
  await writeLocalComments([...comments, nextComment].slice(-2000));
  return nextComment;
}

export async function hideListingComment(input: {
  readonly listingId: string;
  readonly commentId: string;
}): Promise<ListingCommentRecord | null> {
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_comments")
        .update({ status: "hidden" })
        .eq("id", input.commentId)
        .eq("listing_id", input.listingId)
        .select("id, listing_id, author_name, body, created_at")
        .maybeSingle();

      if (error) {
        throw new Error(`COMMENT_HIDE_FAILED:${error.message}`);
      }

      return data ? normalizeCommentRow(data as Record<string, unknown>) : null;
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
    }
  }

  const comments = await readLocalComments();
  let hidden: StoredListingComment | null = null;
  const nextComments = comments.map((comment) => {
    if (comment.id === input.commentId && comment.listingId === input.listingId) {
      hidden = {
        ...comment,
        status: "hidden",
      };
      return hidden;
    }
    return comment;
  });

  if (!hidden) {
    return null;
  }

  await writeLocalComments(nextComments);
  return hidden;
}
