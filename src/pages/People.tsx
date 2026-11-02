import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import { MODE_LABEL, STATE_BADGE } from "../lib/format";
import { useSession } from "../lib/session";
import type { DuplicatePair, Pager, PersonDetail, PersonSummary } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, Pager as PagerBar, ReasonDialog } from "../components/ui";

const PAGE = 25;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

const where = (p: PersonSummary) => [p.city, p.country].filter(Boolean).join(", ") || "—";

export function PeoplePage() {
  const { can } = useSession();
  const canView = can("people:view", false);
  const canEdit = can("people:edit", false);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const search = useDebounced(text.trim());
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<DuplicatePair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => { setPage(0); }, [search]);

  const list = useQuery({
    queryKey: ["people", search, page], enabled: canView, placeholderData: (prev) => prev,
    queryFn: () => api.get<Pager<PersonSummary>>("admin/person", { q: search, page, max: PAGE }),
  });
  const dupes = useQuery({ queryKey: ["people-duplicates"], enabled: canView, queryFn: () => api.get<DuplicatePair[]>("admin/person/duplicates") });

  if (!canView) return <section><div className="page-h"><div><h1>People</h1></div></div><Forbidden need="people:view" /></section>;

  const dismiss = async (reason: string) => {
    if (!dismissing) return;
    setBusy(true); setError(null);
    try {
      await api.post("admin/person/duplicates/dismiss", { personAId: dismissing.a.id, personBId: dismissing.b.id, reason });
      setDismissing(null);
      await qc.invalidateQueries({ queryKey: ["people-duplicates"] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const rows = list.data?.data ?? [];
  const pairs = dupes.data ?? [];

  return (
    <section>
      <div className="page-h"><div><h1>People</h1><p>Everyone with an account or a dependant record. Contact details and health answers are not shown here.</p></div></div>

      {pairs.length > 0 && (
        <div className="card" style={{ marginBottom: "var(--space-4)" }}>
          <div className="card-h"><h3>Possible duplicates</h3><span className="badge b-warn">{pairs.length}</span></div>
          <p className="sm muted">Same date of birth and family name, and a matching first name. Nothing is merged automatically: if they are different people, say so and the pair stops appearing.</p>
          <ul className="stack-3" style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0" }}>
            {pairs.map((p) => (
              <li key={`${p.a.id}-${p.b.id}`} className="row between" style={{ gap: "var(--space-3)", flexWrap: "wrap" }}>
                <span className="sm">
                  <button className="link-btn" onClick={() => setOpenId(p.a.id)}>{p.a.givenName} {p.a.familyName}</button> and{" "}
                  <button className="link-btn" onClick={() => setOpenId(p.b.id)}>{p.b.givenName} {p.b.familyName}</button>
                  <span className="muted"> · born {p.a.dateOfBirth}</span>
                </span>
                {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => { setError(null); setDismissing(p); }}>Not the same person…</button>}
              </li>))}
          </ul>
        </div>
      )}

      <div className="card flush">
        <div className="toolbar">
          <label className="sr" htmlFor="people-search">Search people</label>
          <input id="people-search" className="input" type="search" placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} style={{ maxWidth: 280 }} />
          {list.isFetching && <span className="muted xs" role="status">Refreshing…</span>}
          {list.data && <span className="xs muted" style={{ marginLeft: "auto" }}>{list.data.count} {list.data.count === 1 ? "person" : "people"}</span>}
        </div>
        {list.error ? <div style={{ padding: "var(--space-4)" }}><ErrorAlert error={list.error} /></div> : list.isLoading ? <div style={{ padding: "var(--space-4)" }}><Loading what="Loading people" /></div> : rows.length === 0 ? (
          <Empty title="No people found">{search ? "Nobody matches that name." : "Nobody has signed up yet."}</Empty>
        ) : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Name</th><th>Born</th><th>Location</th><th>Registrations</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="clickable" tabIndex={0} onClick={() => setOpenId(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(p.id); } }} aria-label={`Open ${p.givenName} ${p.familyName}`}>
                <td><b>{p.givenName} {p.familyName}</b></td><td>{p.dateOfBirth ?? "—"}</td><td>{where(p)}</td><td>{p.registrations}</td>
              </tr>))}</tbody></table></div>
        )}
        <PagerBar page={page} max={PAGE} count={list.data?.count ?? 0} onPage={setPage} />
      </div>

      {openId && <PersonDrawer key={openId} id={openId} canEdit={canEdit} onOpen={setOpenId} onClose={() => setOpenId(null)} />}
      <ReasonDialog open={!!dismissing} title="Not the same person?" confirmLabel="Mark as different" busy={busy} error={error}
        onCancel={() => setDismissing(null)} onConfirm={(r) => void dismiss(r)}
        description={dismissing && <>{dismissing.a.givenName} {dismissing.a.familyName} and {dismissing.b.givenName} {dismissing.b.familyName} will no longer be offered as a possible duplicate. Nothing is changed on either record.</>} />
    </section>
  );
}

function PersonDrawer({ id, canEdit, onOpen, onClose }: { id: string; canEdit: boolean; onOpen: (id: string) => void; onClose: () => void }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["person", id], queryFn: () => api.get<PersonDetail>(`admin/person/${id}`) });
  const [mode, setMode] = useState<"pair" | "unpair" | null>(null);
  const [find, setFind] = useState("");
  const query = useDebounced(find.trim());
  const [chosen, setChosen] = useState<PersonSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const candidates = useQuery({
    queryKey: ["people-find", query], enabled: mode === "pair" && query.length >= 2,
    queryFn: () => api.get<Pager<PersonSummary>>("admin/person", { q: query, max: 6 }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !mode) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, mode]);

  const d = detail.data;
  const spouse = d?.relations.find((r) => r.relation === "Spouse");

  const close = () => { setMode(null); setFind(""); setChosen(null); setError(null); };
  const run = async (reason: string) => {
    if (mode === "pair" && !chosen) { setError(new ApiError(400, null, "Pick the spouse from the list first.")); return; }
    setBusy(true); setError(null);
    try {
      if (mode === "pair" && chosen) await api.post(`admin/person/${id}/spouse`, { spousePersonId: chosen.id, reason });
      else if (mode === "unpair") await api.post(`admin/person/${id}/spouse/remove`, { reason });
      const other = mode === "pair" ? chosen?.id : spouse?.personId;
      close();
      await Promise.all([qc.invalidateQueries({ queryKey: ["person", id] }), other ? qc.invalidateQueries({ queryKey: ["person", other] }) : Promise.resolve()]);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <aside className="drawer on" role="dialog" aria-modal="false" aria-labelledby="person-h" style={{ overflow: "auto", padding: "var(--space-5)" }}>
      <div className="row between"><h2 id="person-h">{d ? `${d.person.givenName} ${d.person.familyName}` : "Person"}</h2><button className="btn btn-secondary btn-sm" onClick={onClose} autoFocus>Close</button></div>
      {detail.error ? <ErrorAlert error={detail.error} /> : !d ? <Loading what="Loading person" /> : (
        <div className="stack-4" style={{ marginTop: "var(--space-4)" }}>
          <dl className="kv">
            <dt>Born</dt><dd>{d.person.dateOfBirth ?? "—"}</dd>
            <dt>Gender</dt><dd>{d.gender ?? "—"}</dd>
            <dt>Location</dt><dd>{where(d.person)}</dd>
          </dl>
          <section aria-labelledby="p-family"><h3 id="p-family" className="sm">Family</h3>
            {d.relations.length === 0 ? <p className="sm muted">No relatives on record.</p> : (
              <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{d.relations.map((r) => (
                <li key={`${r.relation}-${r.personId}`}><span className="muted">{r.relation}: </span><button className="link-btn" onClick={() => onOpen(r.personId)}>{r.name}</button></li>))}</ul>)}
            {canEdit && (spouse
              ? <p style={{ marginTop: "var(--space-2)" }}><button className="btn btn-secondary btn-sm" onClick={() => { setError(null); setMode("unpair"); }}>Remove spouse link…</button></p>
              : <p style={{ marginTop: "var(--space-2)" }}><button className="btn btn-secondary btn-sm" onClick={() => { setError(null); setMode("pair"); }}>Pair with a spouse…</button></p>)}
          </section>
          <section aria-labelledby="p-regs"><h3 id="p-regs" className="sm">Registrations</h3>
            {d.registrations.length === 0 ? <p className="sm muted">None yet.</p> : (
              <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{d.registrations.map((r) => (
                <li key={r.id}><span className="mono">{r.reference}</span> · {r.editionName} · {MODE_LABEL[r.mode]} <span className={`badge ${STATE_BADGE[r.state]}`}>{r.state}</span></li>))}</ul>)}
          </section>
        </div>
      )}

      <ReasonDialog open={mode !== null} title={mode === "pair" ? "Pair with a spouse" : "Remove spouse link"} confirmLabel={mode === "pair" ? "Pair spouses" : "Remove link"}
        danger={mode === "unpair"} busy={busy} error={error} onCancel={close} onConfirm={(r) => void run(r)}
        description={mode === "pair" ? <>Both people must be adults and not already paired. For example, say you saw the marriage certificate.</> : <>{d?.person.givenName} and {spouse?.name} will no longer be recorded as spouses.</>}>
        {mode === "pair" && (
          <div className="field">
            <label htmlFor="spouse-find">Find the spouse</label>
            <input id="spouse-find" className="input" type="search" value={find} onChange={(e) => { setFind(e.target.value); setChosen(null); }} placeholder="Type at least two letters of their name" />
            {chosen ? <p className="sm" role="status">Pairing with <b>{chosen.givenName} {chosen.familyName}</b> (born {chosen.dateOfBirth ?? "unknown"})</p> : (
              <ul className="sm" style={{ listStyle: "none", padding: 0, margin: "var(--space-2) 0 0" }}>
                {(candidates.data?.data ?? []).filter((p) => p.id !== id).map((p) => (
                  <li key={p.id}><button type="button" className="link-btn" onClick={() => setChosen(p)}>{p.givenName} {p.familyName}</button> <span className="muted">· born {p.dateOfBirth ?? "unknown"} · {where(p)}</span></li>))}
              </ul>)}
          </div>
        )}
      </ReasonDialog>
    </aside>
  );
}
