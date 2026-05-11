import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${window.location.origin}/api`;
    }
  }

  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3001/api";
  }

  return "/api";
}

const API_BASE = resolveApiBase();
const LOCAL_DEV_SESSION_KEY = "gpupusula.localDevSession";
const LOCAL_DEV_AUTH_EVENT = "gpupusula:local-dev-auth";

export interface SignUpResult {
  requiresEmailConfirmation: boolean;
  session: Session | null;
}

interface LocalDevAuthPayload {
  success: boolean;
  data?: {
    session?: Session;
  };
  error?: {
    message?: string;
  };
}

function getAuthRedirectUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/`;
  }

  return import.meta.env.DEV ? "http://localhost:5173/" : "/";
}

function isLocalDevelopmentBrowser(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function readLocalDevSession(): Session | null {
  if (!isLocalDevelopmentBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_DEV_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Session;
    if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(LOCAL_DEV_SESSION_KEY);
      return null;
    }
    return session.access_token ? session : null;
  } catch {
    window.localStorage.removeItem(LOCAL_DEV_SESSION_KEY);
    return null;
  }
}

function saveLocalDevSession(session: Session): void {
  if (isLocalDevelopmentBrowser()) {
    window.localStorage.setItem(LOCAL_DEV_SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent(LOCAL_DEV_AUTH_EVENT));
  }
}

function clearLocalDevSession(): boolean {
  if (!isLocalDevelopmentBrowser()) {
    return false;
  }

  const hadSession = Boolean(window.localStorage.getItem(LOCAL_DEV_SESSION_KEY));
  window.localStorage.removeItem(LOCAL_DEV_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(LOCAL_DEV_AUTH_EVENT));
  return hadSession;
}

async function postLocalDevAuth(endpoint: "dev-login" | "dev-register", body: Record<string, unknown>): Promise<Session> {
  const response = await fetch(`${API_BASE}/auth/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as LocalDevAuthPayload;
  if (!response.ok || payload.success === false || !payload.data?.session) {
    throw new Error(payload.error?.message ?? "Yerel test oturumu hazirlanamadi.");
  }

  saveLocalDevSession(payload.data.session);
  return payload.data.session;
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isAuthAvailable(): boolean {
  return isLocalDevelopmentBrowser() || isSupabaseBrowserConfigured();
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!isSupabaseBrowserConfigured()) {
    throw new Error("Supabase auth henuz yapilandirilmamis.");
  }

  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export async function getCurrentSession(): Promise<Session | null> {
  const localSession = readLocalDevSession();
  if (localSession) {
    return localSession;
  }

  if (!isSupabaseBrowserConfigured()) {
    return null;
  }

  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (isLocalDevelopmentBrowser()) {
    await postLocalDevAuth("dev-login", { email, password });
    return;
  }

  const client = getSupabaseBrowserClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }
}

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<SignUpResult> {
  if (isLocalDevelopmentBrowser()) {
    const session = await postLocalDevAuth("dev-register", { email, password, displayName });
    return {
      requiresEmailConfirmation: false,
      session,
    };
  }

  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: {
        display_name: displayName || null,
      },
    },
  });

  if (error) {
    throw error;
  }

  return {
    requiresEmailConfirmation: Boolean(data.user && !data.session),
    session: data.session ?? null,
  };
}

export async function signOutUser(): Promise<void> {
  if (clearLocalDevSession()) {
    return;
  }

  const client = getSupabaseBrowserClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void): () => void {
  let removeLocalListener: (() => void) | null = null;
  if (isLocalDevelopmentBrowser()) {
    const handleLocalAuthChange = () => {
      callback(readLocalDevSession());
    };
    window.addEventListener(LOCAL_DEV_AUTH_EVENT, handleLocalAuthChange);
    removeLocalListener = () => window.removeEventListener(LOCAL_DEV_AUTH_EVENT, handleLocalAuthChange);
  }

  if (!isSupabaseBrowserConfigured()) {
    return () => {
      removeLocalListener?.();
    };
  }

  const client = getSupabaseBrowserClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    removeLocalListener?.();
    data.subscription.unsubscribe();
  };
}
