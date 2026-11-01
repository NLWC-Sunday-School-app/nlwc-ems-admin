import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, setUnauthenticatedHandler } from "./api";
import type { AccessMe, Edition, LoginResult, Me } from "./types";
import { can as hasPermission } from "./format";

const EDITION_KEY = "nlwc-admin-edition";

function readEdition(): string | null {
  try { return localStorage.getItem(EDITION_KEY); } catch { return null; }
}
function writeEdition(id: string | null) {
  try { id ? localStorage.setItem(EDITION_KEY, id) : localStorage.removeItem(EDITION_KEY); } catch { /* storage can be blocked */ }
}

type Session = {
  status: "loading" | "signedOut" | "needsMfa" | "ready";
  me: Me | undefined;
  access: AccessMe | undefined;
  editions: Edition[];
  editionsRestricted: boolean;
  editionId: string | null;
  edition: Edition | undefined;
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

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("auth/me"),
    retry: false,
    staleTime: 30_000,
  });
  const me = meQuery.data;
  const ready = !!me?.mfaVerified;

  const accessQuery = useQuery({
    queryKey: ["access", editionId],
    queryFn: () => api.get<AccessMe>("access/me", { editionId }),
    enabled: ready,
  });

  // Listing editions needs config:view. Without it, fall back to the public list so the switcher still has something to show.
  const editionsQuery = useQuery({
    queryKey: ["editions"],
    enabled: ready,
    retry: false,
    queryFn: async (): Promise<{ list: Edition[]; restricted: boolean }> => {
      try {
        return { list: await api.get<Edition[]>("edition"), restricted: false };
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          const pub = await api.get<{ slug: string; code: string; name: string; startsOn: string; endsOn: string }[]>("public/edition");
          // Public rows carry no ids, so they cannot scope a screen; they only tell the person which editions exist.
          return { restricted: true, list: pub.filter((p) => "id" in p) as unknown as Edition[] };
        }
        throw e;
      }
    },
  });

  const editions = editionsQuery.data?.list ?? [];
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
      qc.clear();
      qc.setQueryData(["me"], undefined);
      void qc.invalidateQueries({ queryKey: ["me"] });
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
    qc.clear();
    qc.setQueryData(["me"], undefined);
    await qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);

  const refreshMe = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
    await qc.invalidateQueries({ queryKey: ["access"] });
  }, [qc]);

  const status: Session["status"] = meQuery.isLoading ? "loading" : !me ? "signedOut" : me.mfaVerified ? "ready" : "needsMfa";
  const access = accessQuery.data;

  const value = useMemo<Session>(() => ({
    status, me, access, editions,
    editionsRestricted: editionsQuery.data?.restricted ?? false,
    editionId,
    edition: editions.find((e) => e.id === editionId),
    setEditionId,
    can: (code, scoped = true) => !!access && hasPermission(access.permissions, code, scoped ? editionId : null),
    signIn, signOut, refreshMe,
  }), [status, me, access, editions, editionsQuery.data, editionId, setEditionId, signIn, signOut, refreshMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
