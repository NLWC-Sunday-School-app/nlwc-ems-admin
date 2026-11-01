import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ApiError, api } from "../lib/api";
import { MODE_LABEL, buildRules, formatKobo, formatDateTime, type RuleDraft } from "../lib/format";
import { useSession } from "../lib/session";
import type { ParticipationMode, RateRuleInput } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, ReasonDialog } from "../components/ui";

type Tracked = { versionId: string; note: string; draftedAt: string; state: "Draft" | "Approved" | "Published"; rules: RateRuleInput[] };

const storeKey = (editionId: string) => `nlwc-admin-rates:${editionId}`;
function load(editionId: string): Tracked[] {
  try { return JSON.parse(sessionStorage.getItem(storeKey(editionId)) ?? "[]") as Tracked[]; } catch { return []; }
}
function save(editionId: string, list: Tracked[]) {
  try { sessionStorage.setItem(storeKey(editionId), JSON.stringify(list)); } catch { /* storage can be blocked */ }
}

const blankRule = (): RuleDraft => ({ ageMin: "0", ageMax: "", mode: "", kind: "Free", naira: "" });

export function PricingPage() {
  const { edition, editionId, can } = useSession();
  const [rows, setRows] = useState<RuleDraft[]>([blankRule()]);
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [tracked, setTracked] = useState<Tracked[]>(() => (editionId ? load(editionId) : []));
  const [target, setTarget] = useState<{ versionId: string; action: "approve" | "publish" } | null>(null);
  const [manualId, setManualId] = useState("");
  const [lastEdition, setLastEdition] = useState(editionId);

  if (editionId !== lastEdition) { setLastEdition(editionId); setTracked(editionId ? load(editionId) : []); }

  const canDraft = can("pricing:draft");
  const canApprove = can("pricing:approve");

  const persist = (next: Tracked[]) => { setTracked(next); if (editionId) save(editionId, next); };

  const draft = useMutation({
    mutationFn: (v: { note: string; rules: RateRuleInput[] }) => api.post<{ versionId: string }>(`edition/${editionId}/rates`, { note: v.note || null, rules: v.rules }),
    onSuccess: (r, v) => {
      persist([{ versionId: r.versionId, note: v.note, draftedAt: new Date().toISOString(), state: "Draft", rules: v.rules }, ...tracked]);
      setRows([blankRule()]);
      setNote("");
    },
  });

  const act = useMutation({
    mutationFn: (v: { versionId: string; action: "approve" | "publish"; reason: string }) => api.post(`edition/${editionId}/rates/${v.versionId}/${v.action}`, { note: v.reason }),
    onSuccess: (_r, v) => {
      persist(tracked.map((t) => (t.versionId === v.versionId ? { ...t, state: v.action === "approve" ? "Approved" : "Published" } : t)));
      setTarget(null);
    },
  });

  if (!editionId) return <section><div className="page-h"><div><h1>Pricing &amp; rate plans</h1></div></div><Empty title="Choose an edition">Use the switcher at the top, or paste an edition id if you cannot list editions.</Empty></section>;
  if (!canDraft && !canApprove) return <section><div className="page-h"><div><h1>Pricing &amp; rate plans</h1></div></div><Forbidden need="pricing:draft or pricing:approve" /></section>;

  const setRow = (i: number, patch: Partial<RuleDraft>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { rules, errors } = buildRules(rows);
    setProblems(errors);
    if (errors.length === 0) draft.mutate({ note: note.trim(), rules });
  };

  const sod = act.error instanceof ApiError && /different|same person|drafter|separation/i.test(act.error.message + (act.error.code ?? ""));

  return (
    <section>
      <div className="page-h"><div><h1>Pricing &amp; rate plans</h1><p>{edition?.name ?? "This edition"}. Rates are versioned: drafted, approved by a different person, then published. A published version never changes.</p></div></div>

      {canDraft && (
        <form className="card stack-3" onSubmit={submit} aria-labelledby="draft-h">
          <div className="card-h"><h3 id="draft-h">Draft a new version</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setRows([{ ageMin: "0", ageMax: "", mode: "", kind: "Free", naira: "" }]); setNote("Free for everyone"); }}>Use “free for everyone”</button></div>
          <div className="tbl-wrap"><table>
            <thead><tr><th scope="col">From age</th><th scope="col">To age</th><th scope="col">Mode</th><th scope="col">Price</th><th scope="col" className="num">Amount (₦)</th><th scope="col"><span className="sr">Remove</span></th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                <td><input className="input" aria-label={`Rule ${i + 1} from age`} type="number" min={0} max={120} value={r.ageMin} onChange={(e) => setRow(i, { ageMin: e.target.value })} style={{ width: 80 }} /></td>
                <td><input className="input" aria-label={`Rule ${i + 1} to age (blank for no limit)`} type="number" min={0} max={120} value={r.ageMax} placeholder="∞" onChange={(e) => setRow(i, { ageMax: e.target.value })} style={{ width: 80 }} /></td>
                <td><select className="select" aria-label={`Rule ${i + 1} mode`} value={r.mode} onChange={(e) => setRow(i, { mode: e.target.value as ParticipationMode | "" })}>
                  <option value="">Any mode</option>{(Object.keys(MODE_LABEL) as ParticipationMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select></td>
                <td><select className="select" aria-label={`Rule ${i + 1} price type`} value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value as RuleDraft["kind"] })}><option value="Free">Free</option><option value="Amount">Amount</option></select></td>
                <td className="num"><input className="input" aria-label={`Rule ${i + 1} amount in naira`} inputMode="decimal" disabled={r.kind === "Free"} value={r.kind === "Free" ? "" : r.naira} placeholder={r.kind === "Free" ? "Free" : "5000"} onChange={(e) => setRow(i, { naira: e.target.value })} style={{ width: 120, textAlign: "right" }} /></td>
                <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Remove rule ${i + 1}`}>Remove</button></td>
              </tr>))}</tbody></table></div>
          <div className="row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((r) => [...r, blankRule()])}>+ Add rule</button></div>
          <div className="field"><label htmlFor="rate-note">Note <span className="muted">(optional)</span></label><input id="rate-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bootcamp 2026 is free" /></div>
          {problems.length > 0 && <div className="alert bad" role="alert"><div><b>Fix these first</b><ul style={{ margin: 0, paddingLeft: "1.1rem" }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div></div>}
          <ErrorAlert error={draft.error} />
          <div className="row"><button className="btn btn-primary" disabled={draft.isPending}>{draft.isPending ? "Saving…" : "Save as draft"}</button>
            <span className="xs muted">Amounts are stored as whole kobo. An explicit Free rule is a price; a missing rule is not.</span></div>
        </form>
      )}

      <div className="card stack-3" style={{ marginTop: "var(--space-4)" }}>
        <div className="card-h"><h3>Versions you are working on</h3></div>
        <div className="note">The API has no list of rate versions yet, so this list holds versions drafted in this browser session. To act on an older version, paste its id below.</div>
        {tracked.length === 0 ? <Empty title="Nothing drafted in this session" /> : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Version</th><th>Rules</th><th>State</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{tracked.map((t) => (
              <tr key={t.versionId}>
                <td><div className="mono xs">{t.versionId}</div><div className="xs muted">{t.note || "No note"} · drafted {formatDateTime(t.draftedAt)}</div></td>
                <td className="xs">{t.rules.map((r, i) => <div key={i}>{r.ageMin}{r.ageMax === null ? "+" : `–${r.ageMax}`} · {r.participationMode ? MODE_LABEL[r.participationMode] : "any mode"} · {r.kind === "Free" ? "Free" : formatKobo(r.amountKobo ?? 0)}</div>)}</td>
                <td><span className={`badge ${t.state === "Published" ? "b-ok" : t.state === "Approved" ? "b-info" : "b-neutral"}`}>{t.state}</span></td>
                <td className="right">{canApprove && t.state === "Draft" && <button className="btn btn-secondary btn-sm" onClick={() => { act.reset(); setTarget({ versionId: t.versionId, action: "approve" }); }}>Approve</button>}
                  {canApprove && t.state === "Approved" && <button className="btn btn-primary btn-sm" onClick={() => { act.reset(); setTarget({ versionId: t.versionId, action: "publish" }); }}>Publish</button>}</td>
              </tr>))}</tbody></table></div>
        )}
        {canApprove && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); const id = manualId.trim(); if (/^[0-9a-f-]{36}$/i.test(id) && !tracked.some((t) => t.versionId === id)) { persist([{ versionId: id, note: "Added by id", draftedAt: new Date().toISOString(), state: "Draft", rules: [] }, ...tracked]); setManualId(""); } }}>
            <label htmlFor="manual-id" className="sr">Version id</label>
            <input id="manual-id" className="input mono" style={{ maxWidth: 380 }} placeholder="Paste a version id" value={manualId} onChange={(e) => setManualId(e.target.value)} />
            <button className="btn btn-secondary btn-sm" disabled={!/^[0-9a-f-]{36}$/i.test(manualId.trim())}>Track</button>
          </form>
        )}
        <p className="xs muted">Approval needs a different person from the drafter. After publishing, <Link to="/editions/$editionId" params={{ editionId }}>registration can be opened</Link>.</p>
      </div>

      <ReasonDialog open={!!target} title={target?.action === "approve" ? "Approve these rates?" : "Publish these rates?"}
        description={target?.action === "publish" ? "Once published a version cannot be edited. The previous published version is retired." : "You cannot approve a version you drafted."}
        confirmLabel={target?.action === "approve" ? "Approve" : "Publish"} busy={act.isPending} error={act.error}
        onCancel={() => setTarget(null)} onConfirm={(reason) => target && act.mutate({ ...target, reason })}>
        {sod && <div className="alert warn"><div><b>Separation of duties</b>A different person has to approve. Ask another pricing approver to do this.</div></div>}
      </ReasonDialog>
    </section>
  );
}
