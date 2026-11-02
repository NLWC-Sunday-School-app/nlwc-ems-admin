import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useSession } from "../lib/session";
import type { CampDecisionKind, CampQueue, CampQueueItem } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, ReasonDialog } from "../components/ui";

const DECISION_BADGE: Record<CampDecisionKind, string> = { Approved: "b-ok", Waitlisted: "b-warn", Declined: "b-neutral" };
const VERB: Record<CampDecisionKind, string> = { Approved: "Approve", Waitlisted: "Waitlist", Declined: "Decline" };

export function CampReviewPage() {
  const { edition, editionId, can } = useSession();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ row: CampQueueItem; decision: CampDecisionKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const q = useQuery({
    queryKey: ["camp", editionId], enabled: !!editionId && can("registrations:view"),
    queryFn: () => api.get<CampQueue>("admin/camp", { editionId }),
  });

  const head = <div className="page-h"><div><h1>Camp review</h1><p>A person decides. The system never approves fitness to camp or assigns a bed on its own.</p></div></div>;
  if (!editionId) return <section>{head}<Empty title="Choose an edition">Use the switcher at the top.</Empty></section>;
  if (!can("registrations:view")) return <section>{head}<Forbidden need="registrations:view" /></section>;

  const canDecide = can("registrations:edit");
  const data = q.data;
  const full = !!data && data.capacity !== null && data.approved >= data.capacity;
  const blockedReason = (row: CampQueueItem): string | null => {
    if (data?.capacity == null) return "Set the camp capacity first";
    if (full && row.decision !== "Approved") return "Camp is full";
    return null;
  };

  const decide = async (reason: string) => {
    if (!pending) return;
    setBusy(true); setError(null);
    try {
      await api.post(`admin/camp/${pending.row.registrationId}/decision`, { decision: pending.decision, reason });
      setPending(null);
      await qc.invalidateQueries({ queryKey: ["camp", editionId] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <section>
      {head}
      <p className="muted sm" style={{ marginBottom: "var(--space-3)" }}>{edition?.name}</p>
      {q.error ? <ErrorAlert error={q.error} /> : q.isLoading || !data ? <Loading what="Loading camp requests" /> : (
        <>
          {data.capacity === null
            ? <div className="alert warn" style={{ marginBottom: "var(--space-4)" }}><div><b>Camp capacity is not set.</b>You can waitlist or decline, but approvals stay off until capacity is set under Event editions.</div></div>
            : <div className="alert info" style={{ marginBottom: "var(--space-4)" }}><div><b>{data.approved} of {data.capacity} places approved.</b>{full ? " Camp is full: new requests can only be waitlisted or declined." : ` ${data.capacity - data.approved} left.`}</div></div>}
          {data.rows.length === 0 ? <Empty title="No camp requests">Nobody has asked for camp in this edition yet.</Empty> : (
            <div className="card flush tbl-wrap"><table>
              <thead><tr><th>Applicant</th><th>Age</th><th>Parent consent</th><th>Welfare flags</th><th>Decision</th>{canDecide && <th>Decide</th>}</tr></thead>
              <tbody>{data.rows.map((r) => {
                const block = blockedReason(r);
                return (
                  <tr key={r.registrationId}>
                    <td><b>{r.givenName} {r.familyName}</b><div className="xs muted mono">{r.reference}</div></td>
                    <td>{r.age ?? "—"}</td>
                    <td>{r.guardianConsentGiven ? <span className="badge b-ok">✓ Given</span> : <span className="badge b-warn">Missing</span>}</td>
                    <td>{r.hasHealthFlags === null ? <span className="badge b-lock">🔒 Welfare only</span> : r.hasHealthFlags ? <span className="badge b-warn">Flagged</span> : <span className="muted">None</span>}</td>
                    <td>{r.decision ? <><span className={`badge ${DECISION_BADGE[r.decision]}`}>{r.decision}</span>{r.decisionReason && <div className="xs muted">“{r.decisionReason}”{r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ""}</div>}</> : <span className="badge b-neutral">Pending</span>}</td>
                    {canDecide && <td><span className="row" style={{ gap: 6 }}>
                      {(["Approved", "Waitlisted", "Declined"] as CampDecisionKind[]).map((k) => (
                        <button key={k} className={`btn btn-sm ${k === "Approved" ? "btn-secondary" : "btn-ghost"}`} disabled={r.decision === k || (k === "Approved" && !!block)}
                          title={k === "Approved" && block ? block : undefined} onClick={() => { setError(null); setPending({ row: r, decision: k }); }}>{VERB[k]}</button>))}
                    </span></td>}
                  </tr>);
              })}</tbody></table></div>
          )}
        </>
      )}
      <ReasonDialog open={!!pending} danger={pending?.decision === "Declined"} title={pending ? `${VERB[pending.decision]} ${pending.row.givenName} ${pending.row.familyName}?` : ""}
        confirmLabel={pending ? VERB[pending.decision] : "Save"} busy={busy} error={error} onCancel={() => setPending(null)} onConfirm={(r) => void decide(r)}
        description={pending?.decision === "Approved" ? "This uses one camp place. Say why you are confident they are ready for camp." : "The family will be told this decision once messages are switched on. Say why."} />
    </section>
  );
}
