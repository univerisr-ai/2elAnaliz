import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SubmissionProfile } from "./submission-types.js";

const LOCAL_DEV_TOKEN_PREFIX = "dev_";
const LOCAL_DEV_USER_PREFIX = "dev-user-";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_LOCAL_DEV_ADMIN_EMAILS = ["admin@gpupusula.local", "demir.test@gpupusula.local"];

interface LocalDevAccount {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalDevSession {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

interface LocalDevAuthData {
  accounts: LocalDevAccount[];
  sessions: LocalDevSession[];
}

interface LocalDevAccountInput {
  email: string;
  password: string;
  displayName: string | null;
}

interface LocalDevSignInInput {
  email: string;
  password: string;
}

export interface LocalDevAuthResult {
  profile: SubmissionProfile;
  token: string;
  expiresAt: string;
  created: boolean;
}

function getDefaultStorePath(): string {
  return path.resolve(process.cwd(), ".local-dev/auth.json");
}

function emptyData(): LocalDevAuthData {
  return {
    accounts: [],
    sessions: [],
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getLocalDevAdminEmails(): Set<string> {
  const configuredEmails = (process.env.LOCAL_DEV_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return new Set([...DEFAULT_LOCAL_DEV_ADMIN_EMAILS, ...configuredEmails]);
}

function resolveLocalDevRole(email: string): LocalDevAccount["role"] {
  return getLocalDevAdminEmails().has(normalizeEmail(email)) ? "admin" : "user";
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): { hash: string; salt: string } {
  return {
    hash: scryptSync(password, salt, 64).toString("hex"),
    salt,
  };
}

function passwordMatches(password: string, account: LocalDevAccount): boolean {
  const candidate = Buffer.from(hashPassword(password, account.passwordSalt).hash, "hex");
  const expected = Buffer.from(account.passwordHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function toProfile(account: LocalDevAccount): SubmissionProfile {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    createdAt: account.createdAt,
  };
}

function createSession(userId: string): LocalDevSession {
  const createdAt = new Date().toISOString();
  return {
    token: `${LOCAL_DEV_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`,
    userId,
    createdAt,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

async function readData(storePath: string): Promise<LocalDevAuthData> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDevAuthData>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyData();
    }
    throw error;
  }
}

async function writeData(storePath: string, data: LocalDevAuthData): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function isLocalDevToken(token: string | null | undefined): boolean {
  return typeof token === "string" && token.startsWith(LOCAL_DEV_TOKEN_PREFIX);
}

export function isLocalDevUserId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LOCAL_DEV_USER_PREFIX);
}

export function createLocalDevAuthStore(storePath = getDefaultStorePath()) {
  return {
    async ensureAccount(input: LocalDevAccountInput): Promise<LocalDevAuthResult> {
      const email = normalizeEmail(input.email);
      if (!email || !input.password) {
        throw new Error("DEV_AUTH_EMAIL_PASSWORD_REQUIRED");
      }
      if (input.password.length < 8) {
        throw new Error("DEV_AUTH_PASSWORD_TOO_SHORT");
      }

      const data = await readData(storePath);
      const existingIndex = data.accounts.findIndex((account) => account.email === email);
      const displayName = input.displayName?.trim() || null;
      const password = hashPassword(input.password);
      const now = new Date().toISOString();
      let account: LocalDevAccount;
      let created = false;

      if (existingIndex >= 0) {
        const existing = data.accounts[existingIndex];
        if (!existing) {
          throw new Error("DEV_AUTH_ACCOUNT_NOT_FOUND");
        }
        account = {
          ...existing,
          displayName,
          role: resolveLocalDevRole(email),
          passwordHash: password.hash,
          passwordSalt: password.salt,
          updatedAt: now,
        };
        data.accounts[existingIndex] = account;
      } else {
        created = true;
        account = {
          id: `${LOCAL_DEV_USER_PREFIX}${randomUUID()}`,
          email,
          displayName,
          role: resolveLocalDevRole(email),
          passwordHash: password.hash,
          passwordSalt: password.salt,
          createdAt: now,
          updatedAt: now,
        };
        data.accounts.push(account);
      }

      data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
      const session = createSession(account.id);
      data.sessions.push(session);
      await writeData(storePath, data);

      return {
        profile: toProfile(account),
        token: session.token,
        expiresAt: session.expiresAt,
        created,
      };
    },

    async signIn(input: LocalDevSignInInput): Promise<LocalDevAuthResult> {
      const email = normalizeEmail(input.email);
      const data = await readData(storePath);
      const accountIndex = data.accounts.findIndex((candidate) => candidate.email === email);
      let account = accountIndex >= 0 ? data.accounts[accountIndex] : undefined;
      if (!account || !passwordMatches(input.password, account)) {
        throw new Error("DEV_AUTH_INVALID_CREDENTIALS");
      }

      const resolvedRole = resolveLocalDevRole(email);
      if (account.role !== resolvedRole) {
        account = {
          ...account,
          role: resolvedRole,
          updatedAt: new Date().toISOString(),
        };
        data.accounts[accountIndex] = account;
      }

      data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
      const session = createSession(account.id);
      data.sessions.push(session);
      await writeData(storePath, data);

      return {
        profile: toProfile(account),
        token: session.token,
        expiresAt: session.expiresAt,
        created: false,
      };
    },

    async authenticateToken(token: string): Promise<SubmissionProfile | null> {
      if (!isLocalDevToken(token)) {
        return null;
      }

      const data = await readData(storePath);
      const liveSessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
      const session = liveSessions.find((candidate) => candidate.token === token);
      if (liveSessions.length !== data.sessions.length) {
        data.sessions = liveSessions;
        await writeData(storePath, data);
      }
      if (!session) {
        return null;
      }

      const accountIndex = data.accounts.findIndex((candidate) => candidate.id === session.userId);
      let account = accountIndex >= 0 ? data.accounts[accountIndex] : undefined;
      if (account) {
        const resolvedRole = resolveLocalDevRole(account.email);
        if (account.role !== resolvedRole) {
          account = {
            ...account,
            role: resolvedRole,
            updatedAt: new Date().toISOString(),
          };
          data.accounts[accountIndex] = account;
          await writeData(storePath, data);
        }
      }

      return account ? toProfile(account) : null;
    },
  };
}

const defaultLocalDevAuthStore = createLocalDevAuthStore();

export async function ensureLocalDevAccount(input: LocalDevAccountInput): Promise<LocalDevAuthResult> {
  return defaultLocalDevAuthStore.ensureAccount(input);
}

export async function signInLocalDevAccount(input: LocalDevSignInInput): Promise<LocalDevAuthResult> {
  return defaultLocalDevAuthStore.signIn(input);
}

export async function authenticateLocalDevToken(token: string): Promise<SubmissionProfile | null> {
  return defaultLocalDevAuthStore.authenticateToken(token);
}
