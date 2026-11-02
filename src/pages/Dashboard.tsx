import { Fragment } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { CAPABILITY_LABEL, MODE_LABEL, STAGES, STAGE_LABEL, formatDateRange, stageBadge } from "../lib/format";
import { useSession } from "../lib/session";
import type { Edition, ParticipationMode, RegistrationState, StaffDashboard } from "../lib/types";
import { Empty, Forbidden } from "../components/ui";

const COUNTED: { state: RegistrationState; label: string; hint: string }[] = [
  { state: "Draft", label: "Drafts", hint: "Started, not submitted" },
  { state: "Submitted", label: "Submitted", hint: "Waiting on payment or review" },
  { state: "Confirmed", label: "Confirmed", hint: "Complete" },
  { state: "NeedsAction", label: "Needs action", hint: "Waiting on the family" },
  { state: "Cancelled", label: "Cancelled", hint: "Slot released" },
];

export function Dashboard() {
  const { edition: summary, editionId, can, editions } = useSession();
  const canView = can("registrations:view");
  // The full edition (capabilities, timezone) needs config:view; other roles still get the header from the summary.
  const detail = useQuery({ queryKey: ["edition", editionId], enabled: !!editionId && can("config:view"), retry: false, queryFn: () => api.get<Edition>(`edition/${editionId}`) });
  const edition = detail.data;

  const counts = useQuery({
    queryKey: ["dashboard", editionId],
    enabled: !!editionId && canView,
    queryFn: () => api.get<StaffDashboard>("admin/registration/dashboard", { editionId }),
  });

  if (!summary) {
    return (
      <section>
        <div className="page-h"><div><h1>Dashboard</h1></div></div>
        {editions.length === 0
          ? <Empty title="No editions yet">{can("config:edit", false) ? <>Create the first edition under <Link to="/editions">Event editions</Link>.</> : "You have no editions yet."}</Empty>
          : <Empty title="Choose an edition">Use the switcher at the top.</Empty>}
      </section>
    );
  }
  if (!edition) {
    return (
      <section>
        <div className="page-h"><div><h1>{summary.name}</h1></div></div>
        {can("config:view") ? <p className="muted">Loading…</p> : <Forbidden need="config:view" />}
        {canView && <Counts counts={counts} />}
      </section>
    );
  }

  const stageIndex = edition.stage ? STAGES.indexOf(edition.stage) : -1;
  const enabled = edition.capabilities.filter((c) => c.enabled);

  return (
    <section>
      <div className="page-h">
        <div><h1>{edition.name}</h1><p>{formatDateRange(edition.startsOn, edition.endsOn)} · {edition.timezone}</p></div>
        <span className={`badge ${stageBadge(edition.stage)}`}>{edition.stage ? STAGE_LABEL[edition.stage] : "Unknown stage"}</span>
      </div>

      {!canView ? <Forbidden need="registrations:view" /> : <Counts counts={counts} />}

      <div className="grid g2" style={{ marginTop: "var(--space-4)" }}>
        <div className="card">
          <div className="card-h"><h3>Lifecycle</h3><Link to="/editions/$editionId" params={{ editionId: edition.id }} className="btn btn-secondary btn-sm">Manage</Link></div>
          <ol className="stepper">
            {STAGES.map((s, i) => <li key={s} className={i < stageIndex ? "done" : i === stageIndex ? "cur" : undefined}>{STAGE_LABEL[s]}</li>)}
          </ol>
        </div>
        <div className="card">
          <div className="card-h"><h3>Switched on for this edition</h3></div>
          {enabled.length === 0 ? <p className="muted sm">No capabilities are on. Turn them on under Event editions.</p>
            : <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>{enabled.map((c) => <li key={c.capability}>{CAPABILITY_LABEL[c.capability] ?? c.capability}</li>)}</ul>}
        </div>
      </div>
      <p className="xs muted" style={{ marginTop: "var(--space-4)" }}>
        Revenue, capacity and check-in figures appear here once those modules exist.
      </p>
    </section>
  );
}

const AGE_LABEL: Record<string, string> = { "under-3": "Under 3", "3-9": "3 to 9", "10-16": "10 to 16", "17+": "17 and over" };

function Counts({ counts }: { counts: UseQueryResult<StaffDashboard> }) {
  const d = counts.data;
  const value = (n: number | undefined) => (counts.isLoading ? "…" : counts.isError ? "—" : n ?? 0);
  return (
    <>
      <div className="grid g4" aria-label="Registrations by state">
        {COUNTED.map((c) => (
          <div className="kpi" key={c.state}>
            <div className="l">{c.label}</div>
            <div className="v">{value(d?.byState[c.state])}</div>
            <div className="s">{counts.isError ? "Could not load" : c.hint}</div>
          </div>
        ))}
      </div>
      {d && (
        <div className="grid g3" style={{ marginTop: "var(--space-4)" }}>
          <div className="card">
            <div className="card-h"><h3>Needs attention</h3></div>
            {d.needsAction === 0 && d.staleDrafts === 0 ? <p className="muted sm">Nothing is waiting on you.</p> : (
              <ul className="sm" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {d.needsAction > 0 && <li><b>{d.needsAction}</b> waiting on the family. <Link to="/registrations">Open the queue</Link></li>}
                {d.staleDrafts > 0 && <li><b>{d.staleDrafts}</b> {d.staleDrafts === 1 ? "draft" : "drafts"} untouched for over a week</li>}
              </ul>
            )}
          </div>
          <div className="card">
            <div className="card-h"><h3>How people attend</h3></div>
            <dl className="kv">{(Object.keys(MODE_LABEL) as ParticipationMode[]).map((m) => <Fragment key={m}><dt>{MODE_LABEL[m]}</dt><dd>{d.byMode[m] ?? 0}</dd></Fragment>)}</dl>
          </div>
          <div className="card">
            <div className="card-h"><h3>Age bands</h3></div>
            {Object.keys(d.byAgeBand).length === 0 ? <p className="muted sm">No registrations yet.</p> : (
              <dl className="kv">{Object.keys(AGE_LABEL).filter((b) => d.byAgeBand[b]).map((b) => <Fragment key={b}><dt>{AGE_LABEL[b]}</dt><dd>{d.byAgeBand[b]}</dd></Fragment>)}</dl>
            )}
          </div>
        </div>
      )}
      <p className="xs muted" style={{ marginTop: "var(--space-3)" }}>Cancelled, rejected and expired registrations are left out of the attendance and age counts.</p>
    </>
  );
}
