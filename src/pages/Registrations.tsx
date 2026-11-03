import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, download } from "../lib/api";
import { CONDITION_LABEL, MODE_LABEL, STATE_BADGE, formatDateTime } from "../lib/format";
import { useSession } from "../lib/session";
import type { Health, Pager, ParticipationMode, RegistrationState, StaffRegistration, StaffRegistrationDetail } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, Pager as PagerBar, ReasonDialog } from "../components/ui";

const STATES: RegistrationState[] = ["Draft", "Submitted", "NeedsAction", "Confirmed", "Completed", "Cancelled", "Rejected", "Expired"];
const MODES: ParticipationMode[] = ["Day", "Camp", "Online"];
const AGE_BANDS = [{ value: "under-3", label: "Under 3" }, { value: "3-9", label: "3 to 9" }, { value: "10-16", label: "10 to 16" }, { value: "17+", label: "17 and over" }];
const CONSENT_LABEL: Record<string, string> = { Terms: "Event terms / pick-up notice", GuardianAuthorization: "Parent consent", MedicalEmergency: "Medical emergency", Media: "Photos and videos" };
const PAGE = 25;

/** Follows a fast-changing value (a search box) so each keystroke doesn't hit the API. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
/** The revealed answers disappear from the screen after this long, so nobody leaves a child's health on a shared monitor. */
export const REVEAL_SECONDS = 90;

export function RegistrationsPage() {
  const { edition, editionId, can } = useSession();
  const [state, setState] = useState<RegistrationState | "">("");
  const [mode, setMode] = useState<ParticipationMode | "">("");
  const [ageBand, setAgeBand] = useState("");
  const [text, setText] = useState("");
  const search = useDebounced(text.trim());
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<StaffRegistration | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  useEffect(() => { setPage(0); setOpen(null); }, [editionId, state, mode, ageBand, search]);

  const filters = { editionId, state, mode, ageBand, q: search };
  const q = useQuery({
    queryKey: ["registrations", editionId, state, mode, ageBand, search, page],
    enabled: !!editionId && can("registrations:view"),
    queryFn: () => api.get<Pager<StaffRegistration>>("admin/registration", { ...filters, page, max: PAGE }),
    placeholderData: (prev) => prev,
  });
  const filtered = !!(state || mode || ageBand || search);
  const clear = () => { setState(""); setMode(""); setAgeBand(""); setText(""); };

  const runExport = async (reason: string) => {
    setExportBusy(true);
    setExportError(null);
    try { await download("admin/registration/export", { ...filters, reason }); setExporting(false); }
    catch (e) { setExportError(e); }
    finally { setExportBusy(false); }
  };

  if (!editionId) return <section><div className="page-h"><div><h1>Registrations</h1></div></div><Empty title="Choose an edition">Use the switcher at the top.</Empty></section>;
  if (!can("registrations:view")) return <section><div className="page-h"><div><h1>Registrations</h1></div></div><Forbidden need="registrations:view" /></section>;

  const rows = q.data?.data ?? [];
  const showFlags = rows.some((r) => r.hasHealthFlags !== null) || can("health:flags");

  return (
    <section>
      <div className="page-h"><div><h1>Registrations</h1><p>{edition?.name ?? "This edition"}. Health details are never in this list.</p></div></div>
      <div className="card flush">
        <div className="toolbar">
          <label className="sr" htmlFor="reg-search">Search</label>
          <input id="reg-search" className="input" type="search" placeholder="Search name or reference" value={text} onChange={(e) => setText(e.target.value)} style={{ maxWidth: 260 }} />
          <label className="sr" htmlFor="state-filter">State</label>
          <select id="state-filter" className="select" value={state} onChange={(e) => setState(e.target.value as RegistrationState | "")}>
            <option value="">All states</option>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <label className="sr" htmlFor="mode-filter">Mode</label>
          <select id="mode-filter" className="select" value={mode} onChange={(e) => setMode(e.target.value as ParticipationMode | "")}>
            <option value="">All modes</option>{MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select>
          <label className="sr" htmlFor="age-filter">Age band</label>
          <select id="age-filter" className="select" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
            <option value="">All ages</option>{AGE_BANDS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
          {filtered && <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>Clear filters</button>}
          {q.isFetching && <span className="muted xs" role="status">Refreshing…</span>}
          <span style={{ marginLeft: "auto" }} className="row">
            {q.data && <span className="xs muted">{q.data.count} {q.data.count === 1 ? "registration" : "registrations"}</span>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setExportError(null); setExporting(true); }} disabled={!q.data?.count}>Export CSV…</button>
          </span>
        </div>
        {q.error ? <div style={{ padding: "var(--space-4)" }}><ErrorAlert error={q.error} /></div> : q.isLoading ? <div style={{ padding: "var(--space-4)" }}><Loading what="Loading registrations" /></div> : rows.length === 0 ? (
          <Empty title="No registrations">{filtered ? "Nothing matches these filters." : "Nobody has started a registration for this edition yet."}</Empty>
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
      <ReasonDialog open={exporting} title="Export registrations" confirmLabel="Download CSV" busy={exportBusy} error={exportError}
        onCancel={() => setExporting(false)} onConfirm={(r) => void runExport(r)}
        description={<>Downloads everything matching the current filters ({q.data?.count ?? 0} rows). Health answers are never included. The export is recorded with your name and reason.</>} />
    </section>
  );
}

function RegistrationDrawer({ row, onClose }: { row: StaffRegistration; onClose: () => void }) {
  const { can, editionId } = useSession();
  const qc = useQueryClient();
  const canReveal = can("health:view");
  const detail = useQuery({ queryKey: ["registration", row.id], queryFn: () => api.get<StaffRegistrationDetail>(`admin/registration/${row.id}`) });
  const [cancelling, setCancelling] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const cancel = async (reason: string) => {
    setCancelBusy(true);
    setCancelError(null);
    try {
      await api.post(`admin/registration/${row.id}/cancel`, { reason });
      setCancelling(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["registration", row.id] }), qc.invalidateQueries({ queryKey: ["registrations"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
    } catch (e) { setCancelError(e); }
    finally { setCancelBusy(false); }
  };
  const [resending, setResending] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState<unknown>(null);
  const [resent, setResent] = useState(false);
  const resend = async (reason: string) => {
    setResendBusy(true);
    setResendError(null);
    try {
      await api.post(`admin/registration/${row.id}/resend-confirmation`, { reason });
      setResending(false);
      setResent(true);
      await qc.invalidateQueries({ queryKey: ["audit"] });
    } catch (e) { setResendError(e); }
    finally { setResendBusy(false); }
  };
  const d = detail.data;
  const state = d?.state ?? row.state;
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
        <dt>State</dt><dd><span className={`badge ${STATE_BADGE[state]}`}>{state}</span></dd>
        <dt>Mode</dt><dd>{MODE_LABEL[row.participationMode]}</dd>
        <dt>Age band</dt><dd>{row.ageBand ?? "—"}{d?.ageOnReferenceDate != null ? ` (${d.ageOnReferenceDate} at the event)` : ""}</dd>
        <dt>Started</dt><dd>{formatDateTime(row.dateCreated)}</dd>
        {d && <><dt>Born</dt><dd>{d.person.dateOfBirth ?? "—"}</dd>
          <dt>Location</dt><dd>{[d.person.city, d.person.country].filter(Boolean).join(", ") || "—"}</dd></>}
      </dl>

      {detail.error ? <ErrorAlert error={detail.error} /> : detail.isLoading ? <Loading what="Loading details" /> : d && (
        <div className="stack-4" style={{ marginBottom: "var(--space-4)" }}>
          <section aria-labelledby="d-people"><h3 id="d-people" className="sm">Who is involved</h3>
            <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{d.actors.map((a) => <li key={`${a.personId}-${a.role}`}>{a.name} <span className="muted">· {a.role}</span></li>)}</ul></section>
          <section aria-labelledby="d-consents"><h3 id="d-consents" className="sm">Permissions</h3>
            {d.consents.length === 0 ? <p className="sm muted">Nothing answered yet.</p> : (
              <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{d.consents.map((c) => (
                <li key={c.kind}>{CONSENT_LABEL[c.kind] ?? c.kind}: <b>{c.accepted ? "Yes" : "No"}</b> <span className="muted">· {formatDateTime(c.at)}</span></li>))}</ul>)}</section>
          <section aria-labelledby="d-contact"><h3 id="d-contact" className="sm">Emergency contact</h3>
            <p className="sm">{d.emergencyContact ? <>{d.emergencyContact.fullName} <span className="muted">· {d.emergencyContact.relationship}</span></> : <span className="muted">None on file.</span>}</p></section>
          <section aria-labelledby="d-history"><h3 id="d-history" className="sm">History</h3>
            <ol className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{d.history.map((h, i) => (
              <li key={i}>{h.from ? `${h.from} → ` : ""}<b>{h.to}</b> <span className="muted">· {formatDateTime(h.at)}{h.actor ? ` · ${h.actor}` : ""}</span>{h.reason ? <div className="xs muted">“{h.reason}”</div> : null}</li>))}</ol></section>
          {can("registrations:edit") && ["Submitted", "NeedsAction", "Confirmed", "Completed"].includes(d.state) && (
            <div className="stack-2">
              <button className="btn btn-secondary btn-sm" onClick={() => { setResendError(null); setResent(false); setResending(true); }}>Resend confirmation email…</button>
              {resent && <div className="alert ok" role="status"><div>Confirmation email sent to the parent or guardian.</div></div>}
            </div>
          )}
          {d.cancellable && can("registrations:edit") && <div><button className="btn btn-danger btn-sm" onClick={() => { setCancelError(null); setCancelling(true); }}>Cancel registration…</button></div>}
        </div>
      )}

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
      <ReasonDialog open={resending} title="Resend the confirmation email?" confirmLabel="Resend email" busy={resendBusy} error={resendError}
        onCancel={() => setResending(false)} onConfirm={(r) => void resend(r)}
        description={<>The parent or guardian of {row.givenName} {row.familyName} ({row.reference}) will be emailed the confirmation again, listing all their children registered for this event.</>} />
      <ReasonDialog open={cancelling} danger title="Cancel this registration?" confirmLabel="Cancel registration" busy={cancelBusy} error={cancelError}
        onCancel={() => setCancelling(false)} onConfirm={(r) => void cancel(r)}
        description={<>{row.givenName} {row.familyName} ({row.reference}) will be cancelled and their place released. This can't be undone.</>} />
    </aside>
  );
}
