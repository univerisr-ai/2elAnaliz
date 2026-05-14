import type { NextFunction, Request, Response } from "express";
import { assertSubmissionsConfigured } from "../config/env.js";
import { authenticateLocalDevToken } from "../services/local-dev-auth-service.js";
import { getAuthenticatedSupabaseUser } from "../services/supabase-service.js";
import { getProfileById, upsertProfile } from "../services/submission-repository.js";
import type { AuthenticatedActor } from "../services/submission-types.js";

declare global {
  namespace Express {
    interface Request {
      actor?: AuthenticatedActor;
    }
  }
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.header("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function sendAuthError(response: Response, statusCode: number, message: string, code = "AUTH_ERROR"): void {
  response.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      statusCode,
    },
  });
}

function isLocalDevelopmentRequest(request: Request): boolean {
  const host = (request.hostname || "").trim().toLowerCase();
  return process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
}

export async function requireAuthenticatedUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const token = getBearerToken(request);

    if (!token) {
      sendAuthError(response, 401, "Bu islem icin giris yapman gerekiyor.");
      return;
    }

    if (isLocalDevelopmentRequest(request)) {
      const localProfile = await authenticateLocalDevToken(token);
      if (localProfile) {
        request.actor = {
          id: localProfile.id,
          email: localProfile.email,
          displayName: localProfile.displayName,
          role: localProfile.role,
        };
        next();
        return;
      }
    }

    assertSubmissionsConfigured();
    const authUser = await getAuthenticatedSupabaseUser(token);
    const profile = await upsertProfile({
      id: authUser.id,
      email: authUser.email ?? "",
      displayName: (authUser.user_metadata?.display_name as string | undefined) ?? (authUser.user_metadata?.name as string | undefined) ?? null,
    });

    request.actor = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
    };

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUTH_ERROR";

    if (message === "UNAUTHORIZED") {
      sendAuthError(response, 401, "Gecersiz veya suresi dolmus oturum.");
      return;
    }

    if (message.startsWith("[ENV]")) {
      sendAuthError(
        response,
        503,
        "Giriş yapıldı, ama ilan sistemi için sunucu bağlantısı henüz tamamlanmamış. Yönetici Supabase servis anahtarını Vercel'e eklemeli.",
        "AUTH_CONFIG_MISSING",
      );
      return;
    }

    console.error("[AUTH] Kullanici dogrulanamadi:", error);
    sendAuthError(response, 500, "Kullanici dogrulanirken bir hata olustu.");
  }
}

export async function requireAdminUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  await requireAuthenticatedUser(request, response, async () => {
    const actor = request.actor;
    if (!actor) {
      sendAuthError(response, 401, "Oturum bulunamadi.");
      return;
    }

    if (isLocalDevelopmentRequest(request) && actor.role === "admin") {
      request.actor = {
        ...actor,
        role: "admin",
      };
      next();
      return;
    }

    const profile = await getProfileById(actor.id);
    if (!profile || profile.role !== "admin") {
      sendAuthError(response, 403, "Bu islem yalniz yoneticilere acik.");
      return;
    }

    request.actor = {
      ...actor,
      role: "admin",
    };
    next();
  });
}
