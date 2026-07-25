import type {
  Profile,
  Scenario,
  Session,
  TokenPair,
  Turn,
} from "@aispeakpro/shared";

const TOKEN_KEY = "aispeak.tokens";

export function loadTokens(): TokenPair | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as TokenPair) : null;
}
export function saveTokens(t: TokenPair) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (auth) {
    const tokens = loadTokens();
    if (tokens) headers.set("authorization", `Bearer ${tokens.accessToken}`);
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  register: (email: string, password: string, nativeLanguage: string) =>
    req<TokenPair>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, nativeLanguage }),
    }, false),
  login: (email: string, password: string) =>
    req<TokenPair>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),
  me: () => req<Profile>("/v1/me"),
  scenarios: () => req<Scenario[]>("/v1/scenarios"),
  startSession: (mode: "tutor" | "scene", scenarioSlug?: string) =>
    req<Session>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ mode, scenarioSlug }),
    }),
  submitTurn: (sessionId: string, text: string) =>
    req<{ agentTurn: Turn }>(`/v1/sessions/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  complete: (sessionId: string) =>
    req<Session>(`/v1/sessions/${sessionId}/complete`, { method: "POST" }),
  session: (sessionId: string) =>
    req<{ session: Session; turns: Turn[]; feedback: unknown }>(`/v1/sessions/${sessionId}`),
};

/** Open the realtime control channel for a session. */
export function openRealtime(sessionId: string): WebSocket {
  const tokens = loadTokens();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/v1/realtime/session/${sessionId}?token=${tokens?.accessToken ?? ""}`;
  return new WebSocket(url);
}
