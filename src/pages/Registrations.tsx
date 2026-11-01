import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import { CONDITION_LABEL, MODE_LABEL, STATE_BADGE, formatDateTime } from "../lib/format";
import { useSession } from "../lib/session";
import type { Health, Pager, RegistrationState, StaffRegistration } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, Pager as PagerBar } from "../components/ui";

const STATES: RegistrationState[] = ["Draft", "Submitted", "NeedsAction", "Confirmed", "Completed", "Cancelled", "Rejected", "Expired"];
const PAGE = 25;
/** The revealed answers disappear from the screen after this long, so nobody leaves a child's health on a shared monitor. */
export const REVEAL_SECONDS = 90;

export function RegistrationsPage() {
  const { edition, editionId, can } = useSession();
  const [state, setState] = useState<RegistrationState | "">("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<StaffRegistration | null>(null);

  useEffect(() => { setPage(0); setOpen(null); }, [editionId, state]);

  const q = useQuery({
    queryKey: ["registrations", editionId, state, page],
    enabled: !!editionId && can("registrations:view"),
    queryFn: () => api.get<Pager<StaffRegistration>>("admin/registration", { editionId, state, page, max: PAGE }),
    placeholderData: (prev) => prev,
  });

  if (!editionId) return <section><div className="page-h"><div><h1>Registrations</h1></div></div><Empty title="Choose an edition">Use the switcher at the top.</Empty></section>;
  if (!can("registrations:view")) return <section><div className="page-h"><div><h1>Registrations</h1></div></div><Forbidden need="registrations:view" /></section>;

  const rows = q.data?.data ?? [];
  const showFlags = rows.some((r) => r.hasHealthFlags !== null) || can("health:flags");

  return (
    <section>
      <div className="page-h"><div><h1>Registrations</h1><p>{edition?.name ?? "This edition"}. Health details are never in this list.</p></div></div>
      <div className="card flush">
        <div className="toolbar">
          <label className="sr" htmlFor="state-filter">State</label>
          <select id="state-filter" className="select" value={state} onChange={(e) => setState(e.target.value as RegistrationState | "")}>
            <option value="">All states</option>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          {q.isFetching && <span className="muted xs" role="status">Refreshing…</span>}
        </div>
        {q.error ? <div style={{ padding: "var(--space-4)" }}><ErrorAlert error={q.error} /></div> : q.isLoading ? <div style={{ padding: "var(--space-4)" }}><Loading what="Loading registrations" /></div> : rows.length === 0 ? (
          <Empty title="No registrations">{state ? "None in that state." : "Nobody has started a registration for this edition yet."}</Empty>
        ) : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Reference</th><th>Person</th><th>Mode</th><th>Age band</th><th>State</th>{showFlags && <th>Health</th>}<th>Started</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="clickable" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(r); } }} aria-label={`Open ${r.givenName} ${r.familyName}, ${r.reference}`}>
                <td className="mono">{r.reference}</td>
                <td><b>{r.givenName} {r.familyName}</b></td>
                <td>{MODE_LABEL[r.participationMode]}</td>
                <td>{r.ageBand ?? "—"}</td>
                <td><span className={`badge ${STATE_BADGE[r.state]}`}>{r.state}</span></td>
                {showFlags && <td>{r.hasHealthFlags === null ? <span className="lock" title="Restricted">🔒 Restricted</span> : r.hasHealthFlags ? <span className="badge b-warn">Flagged</span> : <span className="muted">None</span>}</td>}
                <td className="xs">{formatDateTime(r.dateCreated)}</td>
              </tr>))}</tbody></table></div>
        )}
        <PagerBar page={page} max={PAGE} count={q.data?.count ?? 0} onPage={setPage} />
      </div>
      {open && <RegistrationDrawer key={open.id} row={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function RegistrationDrawer({ row, onClose }: { row: StaffRegistration; onClose: () => void }) {
  const { can, editionId } = useSession();
  const canReveal = can("health:view");
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Plain component state on purpose: health is never put in the query cache or any storage, and is gone when this unmounts.
  const [health, setHealth] = useState<{ value: Health; until: number } | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!health) return;
    const tick = () => {
      const remaining = Math.ceil((health.until - Date.now()) / 1000);
      if (remaining <= 0) { setHealth(null); setReason(""); } else setLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [health]);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const value = await api.get<Health>(`admin/registration/${row.id}/health`, { reason: reason.trim() });
      setHealth({ value, until: Date.now() + REVEAL_SECONDS * 1000 });
      setAsking(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const hide = () => { setHealth(null); setReason(""); };
  void editionId;

  return (
    <aside className="drawer on" role="dialog" aria-modal="false" aria-labelledby="drawer-h" style={{ overflow: "auto", padding: "var(--space-5)" }}>
      <div className="row between"><h2 id="drawer-h">{row.givenName} {row.familyName}</h2><button className="btn btn-secondary btn-sm" onClick={onClose} autoFocus>Close</button></div>
      <p className="mono xs muted">{row.reference}</p>
      <dl className="kv" style={{ margin: "var(--space-4) 0" }}>
        <dt>State</dt><dd><span className={`badge ${STATE_BADGE[row.state]}`}>{row.state}</span></dd>
        <dt>Mode</dt><dd>{MODE_LABEL[row.participationMode]}</dd>
        <dt>Age band</dt><dd>{row.ageBand ?? "—"}</dd>
        <dt>Started</dt><dd>{formatDateTime(row.dateCreated)}</dd>
      </dl>

      <div className="sensitive" aria-live="polite">
        <div className="row between"><b>Health &amp; care</b><span className="lock">🔒 Restricted: visible to Medical/Welfare</span></div>

        {health ? (
          <>
            <div className="alert info"><div><b>This view is recorded</b>Your name, the reason and the time are in the access log. Hidden again in {left}s.</div></div>
            {health.value === null ? <p className="sm">No health answers have been given for this registration.</p> : (
              <dl className="kv">
                <dt>Conditions</dt><dd>{health.value.none ? "None declared" : health.value.conditions.map((c) => CONDITION_LABEL[c] ?? c).join(", ") || "—"}</dd>
                <dt>Allergies</dt><dd>{health.value.allergies || "—"}</dd>
                <dt>Care notes</dt><dd>{health.value.notes || "—"}</dd>
              </dl>
            )}
            <button className="btn btn-secondary btn-sm" onClick={hide}>Hide now</button>
          </>
        ) : !canReveal ? (
          <p className="sm muted">{row.hasHealthFlags === null ? "Your role cannot see health information." : row.hasHealthFlags ? "Something was declared. Only Medical/Welfare can open the details." : "Nothing was declared."}</p>
        ) : asking ? (
          <form className="stack-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void reveal(); }}>
            <div className="field"><label htmlFor="reveal-reason">Why are you opening this record?</label>
              <textarea id="reveal-reason" className="textarea" rows={2} maxLength={500} required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Camp fitness review" /></div>
            <p className="xs muted">This is recorded with your name. Don’t copy what you see into chats or spreadsheets.</p>
            <ErrorAlert error={error} />
            <div className="row"><button className="btn btn-primary btn-sm" disabled={busy || !reason.trim()}>{busy ? "Opening…" : "Show health details"}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAsking(false); setError(null); }}>Cancel</button></div>
          </form>
        ) : (
          <>
            <p className="sm muted">{row.hasHealthFlags ? "Something was declared." : row.hasHealthFlags === false ? "Nothing was declared." : "Hidden until you ask to see it."}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => { setError(null); setAsking(true); }}>Reveal health details…</button>
            {error instanceof ApiError ? <ErrorAlert error={error} /> : null}
          </>
        )}
      </div>
    </aside>
  );
}
