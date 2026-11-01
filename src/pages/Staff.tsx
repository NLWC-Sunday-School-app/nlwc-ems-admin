import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDateTime, shortId } from "../lib/format";
import { useSession } from "../lib/session";
import type { Pager, Role, RoleGrant } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, Pager as PagerBar, ReasonDialog } from "../components/ui";

const PAGE = 25;
const LEVEL_ORDER: Record<string, string[]> = {
  pricing: ["draft", "approve"], money: ["view", "edit"], health: ["flags", "view", "full"], custody: ["scan", "act", "view"],
  config: ["view", "edit"], registrations: ["view", "edit"], people: ["view", "edit"], staff: ["view", "edit"], audit: ["view"], communications: ["view", "edit"],
};

/** "Level ● ● ○" style cell text: the highest level a role holds on a resource. */
export function heldLevel(role: Role, resource: string): string | null {
  const order = LEVEL_ORDER[resource] ?? [];
  const held = role.permissions.filter((p) => p.resource === resource).map((p) => order.indexOf(p.level)).filter((i) => i >= 0);
  return held.length ? order[Math.max(...held)] : null;
}

export function StaffPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<"grants" | "matrix">("grants");
  if (!can("staff:view", false) && !can("staff:view")) return <section><div className="page-h"><div><h1>Staff &amp; roles</h1></div></div><Forbidden need="staff:view" /></section>;
  return (
    <section>
      <div className="page-h"><div><h1>Staff &amp; roles</h1><p>Roles are seeded and reviewed, not edited here. Who holds a role, and where, is managed below.</p></div></div>
      <div className="tabs" role="tablist" aria-label="Staff sections">
        <a role="tab" href="#grants" className={tab === "grants" ? "on" : ""} aria-selected={tab === "grants"} onClick={(e) => { e.preventDefault(); setTab("grants"); }}>Role grants</a>
        <a role="tab" href="#matrix" className={tab === "matrix" ? "on" : ""} aria-selected={tab === "matrix"} onClick={(e) => { e.preventDefault(); setTab("matrix"); }}>Role matrix</a>
      </div>
      <div style={{ marginTop: "var(--space-4)" }}>{tab === "grants" ? <Grants /> : <Matrix />}</div>
    </section>
  );
}

function Matrix() {
  const q = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("role") });
  if (q.isLoading) return <Loading what="Loading roles" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const roles = [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const resources = Object.keys(LEVEL_ORDER);
  return (
    <div className="card flush tbl-wrap">
      <table className="matrix">
        <caption className="sr">Which level each role holds on each resource</caption>
        <thead><tr><th scope="col">Resource</th>{roles.map((r) => <th scope="col" key={r.id}>{r.name}</th>)}</tr></thead>
        <tbody>{resources.map((res) => (
          <tr key={res}><th scope="row" style={{ textTransform: "capitalize", fontWeight: 600 }}>{res}</th>
            {roles.map((r) => { const l = heldLevel(r, res); return <td key={r.id}>{l ? <span className="badge b-info">{l}</span> : <span className="muted" aria-label="none">·</span>}</td>; })}</tr>))}</tbody>
      </table>
      <p className="xs muted" style={{ padding: "var(--space-3) var(--space-4)" }}>A higher level includes the lower ones (health full includes view and flags). This matrix is a draft awaiting NLWC review.</p>
    </div>
  );
}

function Grants() {
  const { can, editions, edition } = useSession();
  const qc = useQueryClient();
  const canEdit = can("staff:edit", false) || can("staff:edit");
  const [page, setPage] = useState(0);
  const [activeOnly, setActiveOnly] = useState(true);
  const [revoking, setRevoking] = useState<RoleGrant | null>(null);

  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("role") });
  const names = useMemo(() => new Map((roles.data ?? []).map((r) => [r.id, r.name])), [roles.data]);
  const list = useQuery({
    queryKey: ["grants", page, activeOnly],
    queryFn: () => api.post<Pager<RoleGrant>>(`rolegrant/search?page=${page}&max=${PAGE}`, { activeOnly }),
    placeholderData: (p) => p,
  });

  const revoke = useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post(`rolegrant/${v.id}/revoke`, { reason: v.reason }),
    onSuccess: async () => { setRevoking(null); await qc.invalidateQueries({ queryKey: ["grants"] }); },
  });

  const editionName = (id: string | null) => (id === null ? "Church-wide" : editions.find((e) => e.id === id)?.name ?? shortId(id));
  const state = (g: RoleGrant) => g.revokedAt ? "Revoked" : g.expiresAt && new Date(g.expiresAt) < new Date() ? "Expired" : "Active";

  return (
    <div className="stack-3">
      {canEdit && <GrantForm roles={roles.data ?? []} defaultEdition={edition?.id ?? null} />}
      <div className="card flush">
        <div className="toolbar"><label className="row sm"><input type="checkbox" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setPage(0); }} /> Active grants only</label></div>
        {list.error ? <div style={{ padding: "var(--space-4)" }}><ErrorAlert error={list.error} /></div> : list.isLoading ? <div style={{ padding: "var(--space-4)" }}><Loading what="Loading grants" /></div> : (list.data?.data ?? []).length === 0 ? <Empty title="No grants" /> : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>Account</th><th>Role</th><th>Scope</th><th>Reason</th><th>Granted</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{list.data!.data.map((g) => (
              <tr key={g.id}>
                <td className="mono xs" title={g.accountId}>{shortId(g.accountId)}…</td>
                <td><b>{g.role?.name ?? names.get(g.roleId) ?? shortId(g.roleId)}</b></td>
                <td>{editionName(g.editionId)}</td>
                <td className="xs">{g.reason}</td>
                <td className="xs">{formatDateTime(g.dateCreated)}{g.expiresAt && <div className="muted">expires {formatDateTime(g.expiresAt)}</div>}</td>
                <td><span className={`badge ${state(g) === "Active" ? "b-ok" : "b-neutral"}`}>{state(g)}</span></td>
                <td className="right">{canEdit && state(g) === "Active" && <button className="btn btn-secondary btn-sm" onClick={() => { revoke.reset(); setRevoking(g); }}>Revoke</button>}</td>
              </tr>))}</tbody></table></div>
        )}
        <PagerBar page={page} max={PAGE} count={list.data?.count ?? 0} onPage={setPage} />
      </div>
      <ReasonDialog open={!!revoking} title={`Revoke ${revoking?.role?.name ?? "this role"}?`} description="They lose the access straight away. The grant stays on record." confirmLabel="Revoke" danger
        busy={revoke.isPending} error={revoke.error} onCancel={() => setRevoking(null)} onConfirm={(reason) => revoking && revoke.mutate({ id: revoking.id, reason })} />
    </div>
  );
}

function GrantForm({ roles, defaultEdition }: { roles: Role[]; defaultEdition: string | null }) {
  const { editions } = useSession();
  const qc = useQueryClient();
  const [f, setF] = useState({ accountId: "", role: "", scope: "church", reason: "", expiresAt: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [done, setDone] = useState(false);

  const grant = useMutation({
    mutationFn: () => api.post("rolegrant", {
      accountId: f.accountId.trim(), role: f.role, editionId: f.scope === "church" ? null : f.scope === "current" ? defaultEdition : f.scope,
      reason: f.reason.trim(), expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
    }),
    onSuccess: async () => { setDone(true); setF((s) => ({ ...s, accountId: "", reason: "", expiresAt: "" })); await qc.invalidateQueries({ queryKey: ["grants"] }); },
  });

  const valid = /^[0-9a-f-]{36}$/i.test(f.accountId.trim()) && f.role && f.reason.trim();
  const submit = (e: FormEvent) => { e.preventDefault(); setDone(false); if (valid) grant.mutate(); };

  return (
    <form className="card stack-3" onSubmit={submit} aria-labelledby="grant-h">
      <div className="card-h"><h3 id="grant-h">Grant a role</h3></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="g-acc">Account id</label><input id="g-acc" className="input mono" required value={f.accountId} onChange={set("accountId")} placeholder="xxxxxxxx-xxxx-…" aria-describedby="g-acc-h" /><span id="g-acc-h" className="hint xs muted">The API has no staff directory yet, so paste the account id.</span></div>
        <div className="field"><label htmlFor="g-role">Role</label><select id="g-role" className="select" required value={f.role} onChange={set("role")}><option value="">Choose…</option>{roles.map((r) => <option key={r.id} value={r.key}>{r.name}</option>)}</select></div>
        <div className="field"><label htmlFor="g-scope">Where</label><select id="g-scope" className="select" value={f.scope} onChange={set("scope")}><option value="church">Church-wide</option>{editions.filter((e) => e.id).map((e) => <option key={e.id} value={e.id}>{e.name} only</option>)}</select></div>
        <div className="field"><label htmlFor="g-exp">Expires <span className="muted">(optional)</span></label><input id="g-exp" className="input" type="datetime-local" value={f.expiresAt} onChange={set("expiresAt")} /></div>
      </div>
      <div className="field"><label htmlFor="g-why">Reason <span className="muted">(required, recorded in the audit log)</span></label><input id="g-why" className="input" required maxLength={500} value={f.reason} onChange={set("reason")} /></div>
      <ErrorAlert error={grant.error} />
      {done && !grant.error && <div className="alert ok" role="status"><div>Role granted.</div></div>}
      <div className="row"><button className="btn btn-primary" disabled={!valid || grant.isPending}>{grant.isPending ? "Granting…" : "Grant role"}</button>
        <span className="xs muted">Staff permissions only take effect once that person has set up MFA.</span></div>
    </form>
  );
}
