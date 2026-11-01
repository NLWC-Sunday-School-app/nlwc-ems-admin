import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDateTime, shortId } from "../lib/format";
import { useSession } from "../lib/session";
import type { AuditEvent, Pager } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, Pager as PagerBar } from "../components/ui";

const PAGE = 50;

/** The stored detail is JSON text; show it indented, or as-is if it is not valid. */
export function prettyDetail(detail: string): string {
  try { return JSON.stringify(JSON.parse(detail), null, 2); } catch { return detail; }
}

export function AuditPage() {
  const { can } = useSession();
  const [page, setPage] = useState(0);
  const [action, setAction] = useState("");
  const [applied, setApplied] = useState("");
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const allowed = can("audit:view", false) || can("audit:view");

  const q = useQuery({
    queryKey: ["audit", page, applied],
    enabled: allowed,
    queryFn: () => api.get<Pager<AuditEvent>>("audit", { page, max: PAGE, action: applied }),
    placeholderData: (p) => p,
  });
  const verify = useMutation({ mutationFn: () => api.get<number | null>("audit/verify") });

  if (!allowed) return <section><div className="page-h"><div><h1>Audit log</h1></div></div><Forbidden need="audit:view" /></section>;
  const rows = q.data?.data ?? [];

  return (
    <section>
      <div className="page-h">
        <div><h1>Audit log</h1><p>Append-only and hash-chained: a row cannot be changed or removed without breaking the chain.</p></div>
        <button className="btn btn-secondary" onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? "Checking chain…" : "Verify chain"}</button>
      </div>
      {verify.isSuccess && (verify.data === null || verify.data === undefined
        ? <div className="alert ok" role="status"><div><b>Chain intact</b>Every row matches the hash of the one before it.</div></div>
        : <div className="alert bad" role="alert"><div><b>Chain broken at row {verify.data}</b>Treat this as a security incident and tell the Super Admin.</div></div>)}
      <ErrorAlert error={verify.error} />
      <div className="card flush" style={{ marginTop: "var(--space-4)" }}>
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(action.trim()); }}>
          <label className="sr" htmlFor="audit-action">Action</label>
          <input id="audit-action" className="input" placeholder="Filter by action, e.g. registration.submitted" value={action} onChange={(e) => setAction(e.target.value)} style={{ minWidth: 280 }} />
          <button className="btn btn-secondary btn-sm">Filter</button>
          {applied && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAction(""); setApplied(""); setPage(0); }}>Clear</button>}
        </form>
        {q.error ? <div style={{ padding: "var(--space-4)" }}><ErrorAlert error={q.error} /></div> : q.isLoading ? <div style={{ padding: "var(--space-4)" }}><Loading what="Loading audit log" /></div> : rows.length === 0 ? <Empty title="No events" /> : (
          <div className="tbl-wrap"><table>
            <thead><tr><th className="num">#</th><th>When</th><th>Action</th><th>What</th><th>Who</th><th>Reason</th><th><span className="sr">Detail</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <Fragment key={r.seq}>
                <tr>
                  <td className="num mono xs">{r.seq}</td>
                  <td className="xs">{formatDateTime(r.occurredAt)}</td>
                  <td><span className="mono xs">{r.action}</span></td>
                  <td><b>{r.entityType}</b>{r.displayName && <div className="xs muted">{r.displayName}</div>}</td>
                  <td className="mono xs" title={r.actorAccountId ?? ""}>{r.actorAccountId ? `${shortId(r.actorAccountId)}…` : "system"}</td>
                  <td className="xs">{r.reason ?? <span className="muted">—</span>}</td>
                  <td className="right"><button className="btn btn-ghost btn-sm" aria-expanded={openSeq === r.seq} onClick={() => setOpenSeq(openSeq === r.seq ? null : r.seq)}>{openSeq === r.seq ? "Hide" : "Detail"}</button></td>
                </tr>
                {openSeq === r.seq && <tr><td colSpan={7}><pre className="detail">{prettyDetail(r.detail)}</pre><div className="mono xs muted">hash {r.hash}</div></td></tr>}
              </Fragment>))}</tbody></table></div>
        )}
        <PagerBar page={page} max={PAGE} count={q.data?.count ?? 0} onPage={setPage} />
      </div>
    </section>
  );
}
