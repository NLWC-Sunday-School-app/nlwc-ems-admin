import type { Envelope } from "./types";

/** A failed call. `code` is the API's machine-readable reason (`mfa_required`, `dob_locked`...); status 0 means the network failed. */
export class ApiError extends Error {
  constructor(public status: number, public code: string | null, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const CSRF_COOKIE = "nlwc_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readCookie(name: string, cookieString: string = typeof document === "undefined" ? "" : document.cookie): string | null {
  for (const part of cookieString.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function queryString(params?: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

type Listener = () => void;
let onUnauthenticated: Listener | null = null;
/** Called when a request answers 401 `unauthenticated`, so the app can return to sign-in. */
export function setUnauthenticatedHandler(fn: Listener | null) {
  onUnauthenticated = fn;
}

export async function request<T>(method: string, path: string, body?: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  let response: Response;
  try {
    response = await fetcher(`/api/v1/${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }

  const text = await response.text();
  let envelope: Envelope<T> | null = null;
  try {
    envelope = text ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    // A 5xx can come back as plain text; never show that to a user.
  }

  if (!response.ok || (envelope && envelope.success === false)) {
    const code = envelope?.code ?? null;
    if (response.status === 401 && code === "unauthenticated") onUnauthenticated?.();
    const message = envelope?.message ?? (response.status >= 500 ? "Something went wrong on our side. Try again." : `Request failed (${response.status}).`);
    throw new ApiError(response.status, code, message);
  }
  return (envelope?.data ?? (undefined as T)) as T;
}

/** Saves a file the API returns (a CSV export). Same cookies and error handling as `request`. */
export async function download(path: string, params?: Record<string, string | number | boolean | null | undefined>, fetcher: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(`/api/v1/${path}${queryString(params)}`, { credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  if (!response.ok) {
    let code: string | null = null;
    let message = `Request failed (${response.status}).`;
    try { const e = (await response.json()) as Envelope<unknown>; code = e.code ?? null; message = e.message ?? message; } catch { /* not JSON */ }
    if (response.status === 401 && code === "unauthenticated") onUnauthenticated?.();
    throw new ApiError(response.status, code, message);
  }
  const name = /filename="?([^";]+)"?/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "export.csv";
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | null | undefined>) => request<T>("GET", path + queryString(params)),
  post: <T = void>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T = void>(path: string, body: unknown = {}) => request<T>("PUT", path, body),
};
