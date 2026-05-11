import type { NextFunction, Request, Response } from "express";
import { ENV } from "../config/env.js";
import { consumeRateLimit } from "../services/rate-limit-service.js";

const HOURLY_WINDOW_MS = 60 * 60 * 1000;

function sendRateLimit(response: Response, message: string): void {
  response.status(429).json({
    success: false,
    error: {
      code: "RATE_LIMITED",
      message,
      statusCode: 429,
    },
  });
}

function getClientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

async function enforceHourlyLimit(input: {
  readonly request: Request;
  readonly response: Response;
  readonly userLimit: number;
  readonly ipLimit: number;
  readonly scope: string;
  readonly userMessage: string;
  readonly ipMessage: string;
}): Promise<boolean> {
  const userId = input.request.actor?.id;
  if (userId) {
    const allowed = await consumeRateLimit({
      scope: `${input.scope}:user`,
      identity: userId,
      limit: input.userLimit,
      windowMs: HOURLY_WINDOW_MS,
    });

    if (!allowed) {
      sendRateLimit(input.response, input.userMessage);
      return false;
    }
  }

  const ipAllowed = await consumeRateLimit({
    scope: `${input.scope}:ip`,
    identity: getClientIp(input.request),
    limit: input.ipLimit,
    windowMs: HOURLY_WINDOW_MS,
  });

  if (!ipAllowed) {
    sendRateLimit(input.response, input.ipMessage);
    return false;
  }

  return true;
}

export async function submissionRateLimit(request: Request, response: Response, next: NextFunction): Promise<void> {
  const allowed = await enforceHourlyLimit({
    request,
    response,
    userLimit: ENV.USER_SUBMISSION_HOURLY_LIMIT,
    ipLimit: ENV.IP_SUBMISSION_HOURLY_LIMIT,
    scope: "submission",
    userMessage: "Saatlik kullanici ilan limiti doldu. Biraz sonra tekrar dene.",
    ipMessage: "Bu IP icin saatlik ilan ekleme limiti doldu. Biraz sonra tekrar dene.",
  });

  if (allowed) {
    next();
  }
}

export async function commentRateLimit(request: Request, response: Response, next: NextFunction): Promise<void> {
  const allowed = await enforceHourlyLimit({
    request,
    response,
    userLimit: ENV.USER_COMMENT_HOURLY_LIMIT,
    ipLimit: ENV.IP_COMMENT_HOURLY_LIMIT,
    scope: "comment",
    userMessage: "Saatlik yorum limiti doldu. Biraz sonra tekrar dene.",
    ipMessage: "Bu IP icin saatlik yorum limiti doldu. Biraz sonra tekrar dene.",
  });

  if (allowed) {
    next();
  }
}
