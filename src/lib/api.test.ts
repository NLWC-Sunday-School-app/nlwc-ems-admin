import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, queryString, readCookie, request, setUnauthenticatedHandler } from "./api";

const reply = (status: number, body: unknown, raw = false) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(raw ? (body as string) : JSON.stringify(body), { status }));

afterEach(() => {
  document.cookie = "nlwc_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  setUnauthenticatedHandler(null);
});

describe("readCookie / queryString", () => {
  it("reads a named cookie and decodes it", () => {
    expect(readCookie("b", "a=1; b=x%20y; c=3")).toBe("x y");
    expect(readCookie("missing", "a=1")).toBeNull();
  });
  it("keeps equals signs inside a value", () => {
    expect(readCookie("t", "t=abc==")).toBe("abc==");
  });
  it("drops empty values and encodes the rest", () => {
    expect(queryString({ a: "x y", b: "", c: null, d: undefined, e: 0, f: false })).toBe("?a=x+y&e=0&f=false");
    expect(queryString()).toBe("");
  });
});

describe("request", () => {
  it("unwraps the envelope's data", async () => {
    const f = reply(200, { success: true, message: null, code: null, data: { id: 7 } });
    await expect(request("GET", "edition/1", undefined, f)).resolves.toEqual({ id: 7 });
    expect(f).toHaveBeenCalledWith("/api/v1/edition/1", expect.objectContaining({ method: "GET", credentials: "same-origin" }));
  });

  it("sends the CSRF header on writes but not on reads", async () => {
    document.cookie = "nlwc_csrf=tok123";
    const post = reply(200, { success: true, message: null, code: null, data: null });
    await request("POST", "x", { a: 1 }, post);
    const init = post.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("tok123");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');

    const get = reply(200, { success: true, message: null, code: null, data: 1 });
    await request("GET", "x", undefined, get);
    expect(get.mock.calls[0][1]!.headers).not.toHaveProperty("X-CSRF-Token");
  });

  it("turns a failure into an ApiError with the machine-readable code", async () => {
    const f = reply(409, { success: false, message: "Already there.", code: "duplicate", data: null });
    const err = await request("POST", "x", {}, f).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "duplicate", message: "Already there." });
  });

  it("tells the app when the session is gone", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    await request("GET", "x", undefined, reply(401, { success: false, message: "Sign in to continue.", code: "unauthenticated" })).catch(() => {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not treat a 403 as a lost session", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    await request("GET", "x", undefined, reply(403, { success: false, message: "No.", code: "mfa_required" })).catch(() => {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("never shows a plain-text server error to the user", async () => {
    const err = (await request("GET", "x", undefined, reply(500, "System.NullReferenceException at Foo.Bar", true)).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toContain("NullReference");
    expect(err.status).toBe(500);
  });

  it("reports a network failure as status 0", async () => {
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(request("GET", "x", undefined, f as unknown as typeof fetch)).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("resolves undefined for a success with no body", async () => {
    await expect(request("POST", "x", {}, reply(200, "", true))).resolves.toBeUndefined();
  });
});
