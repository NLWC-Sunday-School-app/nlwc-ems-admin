import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, api, setUnauthenticatedHandler } from "./api";
import type { AccessMe, EditionSummary, LoginResult, Me } from "./types";
import { can as hasPermission } from "./format";

const EDITION_KEY = "nlwc-admin-edition";

function readEdition(): string | null {
  try { return localStorage.getItem(EDITION_KEY); } catch { return null; }
}
function writeEdition(id: string | null) {
  try { id ? localStorage.setItem(EDITION_KEY, id) : localStorage.removeItem(EDITION_KEY); } catch { /* storage can be blocked */ }
}

/** Drops everything cached for the person who was signed in (including any health shown in a drawer's parent views) and shows sign-in. */
function forgetEverything(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  qc.setQueryData(["me"], null);
}

type Session = {
  status: "loading" | "signedOut" | "needsMfa" | "ready";
  me: Me | undefined;
  access: AccessMe | undefined;
  editions: EditionSummary[];
  editionId: string | null;
  edition: EditionSummary | undefined;
  setEditionId: (id: string | null) => void;
  can: (code: string, scoped?: boolean) => boolean;
  signIn: (email: string, password: string) => Promise<LoginResult>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [editionId, setEditionIdState] = useState<string | null>(readEdition);

  // null means "nobody is signed in", which is an answer, not an error.
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      try { return await api.get<Me>("auth/me"); } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    retry: false,
    staleTime: 30_000,
  });
  const me = meQuery.data ?? undefined;
  const ready = !!me?.mfaVerified;

  const accessQuery = useQuery({
    queryKey: ["access", editionId],
    queryFn: () => api.get<AccessMe>("access/me", { editionId }),
    enabled: ready,
    // Switching edition refetches with a new key; without this the nav empties for a moment and screens flash "forbidden".
    placeholderData: keepPreviousData,
  });

  // The editions this person's grants cover. Works for every staff role, unlike the full list, which needs config:view.
  const editionsQuery = useQuery({
    queryKey: ["my-editions"],
    enabled: ready,
    retry: false,
    queryFn: () => api.get<EditionSummary[]>("edition/mine"),
  });

  const editions = editionsQuery.data ?? [];
  useEffect(() => {
    // Keep the saved choice only if it still exists; otherwise default to the first edition.
    if (!ready || !editionsQuery.data) return;
    const ids = editions.map((e) => e.id).filter(Boolean);
    if (ids.length === 0) return;
    if (!editionId || !ids.includes(editionId)) {
      setEditionIdState(ids[0]);
      writeEdition(ids[0]);
    }
  }, [ready, editionsQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEditionId = useCallback((id: string | null) => {
    setEditionIdState(id);
    writeEdition(id);
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      // Only a signed-in session can be "lost". The sign-in check itself answers 401 when nobody is signed in.
      if (!qc.getQueryData(["me"])) return;
      forgetEverything(qc);
    });
    return () => setUnauthenticatedHandler(null);
  }, [qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.post<LoginResult>("auth/login", { email, password, surface: "admin" });
    await qc.invalidateQueries({ queryKey: ["me"] });
    return result;
  }, [qc]);

  const signOut = useCallback(async () => {
    try { await api.post("auth/logout"); } catch { /* the cookie is cleared server-side; either way we leave */ }
    forgetEverything(qc);
  }, [qc]);

  const refreshMe = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
    await qc.invalidateQueries({ queryKey: ["access"] });
  }, [qc]);

  const status: Session["status"] = meQuery.isLoading ? "loading" : !me ? "signedOut" : me.mfaVerified ? "ready" : "needsMfa";
  const access = accessQuery.data;

  const value = useMemo<Session>(() => ({
    status, me, access, editions,
    editionId,
    edition: editions.find((e) => e.id === editionId),
    setEditionId,
    can: (code, scoped = true) => !!access && hasPermission(access.permissions, code, scoped ? editionId : null),
    signIn, signOut, refreshMe,
  }), [status, me, access, editions, editionsQuery.data, editionId, setEditionId, signIn, signOut, refreshMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
