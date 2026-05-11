import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ENV, isSupabaseConfigured } from "../config/env.js";
import type { SubmissionProfile } from "./submission-types.js";

let adminClient: SupabaseClient | null = null;

interface EnsureLocalAuthUserInput {
  email: string;
  password: string;
  displayName: string | null;
}

export interface EnsureLocalAuthUserResult {
  id: string;
  email: string;
  displayName: string | null;
  created: boolean;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  if (!adminClient) {
    adminClient = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

export async function getAuthenticatedSupabaseUser(token: string): Promise<User> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("UNAUTHORIZED");
  }

  return data.user;
}

export function mapProfileRow(row: Record<string, unknown>): SubmissionProfile {
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    displayName: row.display_name ? String(row.display_name) : null,
    role: row.role === "admin" ? "admin" : "user",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function ensureLocalAuthUser(input: EnsureLocalAuthUserInput): Promise<EnsureLocalAuthUserResult> {
  const client = getSupabaseAdmin();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedDisplayName = input.displayName?.trim() || null;

  const listedUsers = await client.auth.admin.listUsers();
  if (listedUsers.error) {
    throw new Error(`AUTH_USER_LIST_FAILED:${listedUsers.error.message}`);
  }

  const existingUser = listedUsers.data.users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);

  if (existingUser) {
    const updatedUser = await client.auth.admin.updateUserById(existingUser.id, {
      password: input.password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata ?? {}),
        display_name: normalizedDisplayName,
      },
    });

    if (updatedUser.error || !updatedUser.data.user) {
      throw new Error(`AUTH_USER_UPDATE_FAILED:${updatedUser.error?.message ?? "UNKNOWN"}`);
    }

    return {
      id: updatedUser.data.user.id,
      email: updatedUser.data.user.email ?? normalizedEmail,
      displayName: normalizedDisplayName,
      created: false,
    };
  }

  const createdUser = await client.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: normalizedDisplayName,
    },
  });

  if (createdUser.error || !createdUser.data.user) {
    throw new Error(`AUTH_USER_CREATE_FAILED:${createdUser.error?.message ?? "UNKNOWN"}`);
  }

  return {
    id: createdUser.data.user.id,
    email: createdUser.data.user.email ?? normalizedEmail,
    displayName: normalizedDisplayName,
    created: true,
  };
}
