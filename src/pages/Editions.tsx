import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ApiError, api } from "../lib/api";
import {
  CAPABILITY_LABEL, STAGES, STAGE_LABEL, formatDateRange, nextStages, stageBadge,
} from "../lib/format";
import { useSession } from "../lib/session";
import type { CreateEditionInput, Edition, EditionStage, UpdateEditionInput } from "../lib/types";
import { Empty, ErrorAlert, Forbidden, Loading, ReasonDialog, Switch } from "../components/ui";

const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const timeOrNull = (v: string) => (v ? (v.length === 5 ? `${v}:00` : v) : null);
const timeValue = (v: string | null) => (v ? v.slice(0, 5) : "");

export function EditionsPage() {
  const { can, setEditionId } = useSession();
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ["edition-list"], queryFn: () => api.get<Edition[]>("edition"), retry: false });
  const canEdit = can("config:edit", false);

  if (list.error instanceof ApiError && list.error.status === 403) return <section><div className="page-h"><div><h1>Event editions</h1></div></div><Forbidden need="config:view" /></section>;

  return (
    <section>
      <div className="page-h">
        <div><h1>Event editions</h1><p>A template (family) has many editions. Each edition owns its dates, rules, rate plan and capabilities.</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>{creating ? "Close" : "+ New edition"}</button>}
      </div>

      {creating && <NewEdition onDone={(id) => { setCreating(false); setEditionId(id); }} />}

      <div className="card flush tbl-wrap" style={{ marginTop: creating ? "var(--space-4)" : 0 }}>
        {list.isLoading ? <div style={{ padding: "var(--space-4)" }}><Loading what="Loading editions" /></div> : list.error ? <ErrorAlert error={list.error} /> : (list.data ?? []).length === 0 ? (
          <Empty title="No editions yet">{canEdit ? "Create the first one with “New edition”." : "An admin has not created one yet."}</Empty>
        ) : (
          <table>
            <thead><tr><th>Edition</th><th>Dates</th><th>Lifecycle</th><th>Capabilities on</th></tr></thead>
            <tbody>
              {list.data!.map((e) => (
                <tr key={e.id}>
                  <td><Link to="/editions/$editionId" params={{ editionId: e.id }} onClick={() => setEditionId(e.id)}><b>{e.name}</b></Link><div className="mono xs muted">{e.code}</div></td>
                  <td>{formatDateRange(e.startsOn, e.endsOn)}</td>
                  <td><span className={`badge ${stageBadge(e.stage)}`}>{e.stage ? STAGE_LABEL[e.stage] : "—"}</span></td>
                  <td className="xs">{e.capabilities.filter((c) => c.enabled).map((c) => CAPABILITY_LABEL[c.capability] ?? c.capability).join(" · ") || <span className="muted">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** "Bible Bootcamp 2026" or a pasted link becomes "bible-bootcamp-2026": lower case, words joined by single hyphens. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/^https?:\/\/[^/]*\/?/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-{2,}/g, "-").slice(0, 100);
}

function NewEdition({ onDone }: { onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    templateCode: "BB", name: "", code: "", slug: "", startsOn: "", endsOn: "", venueName: "", venueAddress: "",
    minAge: "", maxAge: "", campMinAge: "", campMaxAge: "", campCapacity: "", pickupStart: "", pickupEnd: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  // The web address fills itself in from the name until someone edits it; whatever is typed or pasted is cleaned into a valid one.
  const [slugEdited, setSlugEdited] = useState(false);
  const setName = (e: { target: { value: string } }) => setF((s) => ({ ...s, name: e.target.value, slug: slugEdited ? s.slug : slugify(e.target.value).replace(/-+$/, "") }));
  const setSlug = (e: { target: { value: string } }) => { setSlugEdited(true); setF((s) => ({ ...s, slug: slugify(e.target.value) })); };

  const create = useMutation({
    mutationFn: (input: CreateEditionInput) => api.post<Edition>("edition", input),
    onSuccess: async (edition) => {
      await qc.invalidateQueries({ queryKey: ["editions"] });
    await qc.invalidateQueries({ queryKey: ["my-editions"] });
      await qc.invalidateQueries({ queryKey: ["edition-list"] });
      onDone(edition.id);
      void navigate({ to: "/editions/$editionId", params: { editionId: edition.id } });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      templateCode: f.templateCode, name: f.name.trim(), code: f.code.trim().toUpperCase(), slug: slugify(f.slug).replace(/-+$/, ""), startsOn: f.startsOn, endsOn: f.endsOn,
      venueName: f.venueName.trim() || undefined, venueAddress: f.venueAddress.trim() || undefined,
      minAge: intOrNull(f.minAge), maxAge: intOrNull(f.maxAge), campMinAge: intOrNull(f.campMinAge), campMaxAge: intOrNull(f.campMaxAge), campCapacity: intOrNull(f.campCapacity),
      pickupWindowStart: timeOrNull(f.pickupStart), pickupWindowEnd: timeOrNull(f.pickupEnd),
    });
  };

  return (
    <form className="card stack-3" onSubmit={submit} aria-labelledby="new-ed">
      <div className="card-h"><h3 id="new-ed">New edition</h3></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="ne-t">Template</label>
          <select id="ne-t" className="select" value={f.templateCode} onChange={set("templateCode")}>
            <option value="BB">Bible Bootcamp</option><option value="SS">Singlz Summit</option><option value="CP">Couples Retreat</option></select></div>
        <div className="field"><label htmlFor="ne-n">Name</label><input id="ne-n" className="input" required maxLength={200} value={f.name} onChange={setName} placeholder="Bible Bootcamp 2026" /></div>
        <div className="field"><label htmlFor="ne-c">Code <span className="muted">used in references</span></label><input id="ne-c" className="input" required maxLength={20} value={f.code} onChange={set("code")} placeholder="BB26" /></div>
        <div className="field"><label htmlFor="ne-s">Web address name <span className="muted">just the last part, e.g. bible-bootcamp-2026</span></label><input id="ne-s" className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Lower-case words joined by hyphens, not a full link" value={f.slug} onChange={setSlug} onBlur={() => setF((s) => ({ ...s, slug: s.slug.replace(/-+$/, "") }))} placeholder="bible-bootcamp-2026" /></div>
        <div className="field"><label htmlFor="ne-a">First day</label><input id="ne-a" className="input" type="date" required value={f.startsOn} onChange={set("startsOn")} /></div>
        <div className="field"><label htmlFor="ne-b">Last day</label><input id="ne-b" className="input" type="date" required min={f.startsOn} value={f.endsOn} onChange={set("endsOn")} /></div>
        <div className="field"><label htmlFor="ne-v">Venue</label><input id="ne-v" className="input" maxLength={200} value={f.venueName} onChange={set("venueName")} /></div>
        <div className="field"><label htmlFor="ne-va">Venue address</label><input id="ne-va" className="input" maxLength={500} value={f.venueAddress} onChange={set("venueAddress")} /></div>
        <div className="field"><label htmlFor="ne-min">Minimum age <span className="muted">anyone younger cannot register</span></label><input id="ne-min" className="input" type="number" min={0} max={120} value={f.minAge} onChange={set("minAge")} /></div>
        <div className="field"><label htmlFor="ne-max">Maximum age <span className="muted">anyone older cannot register</span></label><input id="ne-max" className="input" type="number" min={0} max={120} value={f.maxAge} onChange={set("maxAge")} /></div>
        <div className="field"><label htmlFor="ne-cmin">Camp minimum age</label><input id="ne-cmin" className="input" type="number" min={0} max={120} value={f.campMinAge} onChange={set("campMinAge")} /></div>
        <div className="field"><label htmlFor="ne-cmax">Camp maximum age</label><input id="ne-cmax" className="input" type="number" min={0} max={120} value={f.campMaxAge} onChange={set("campMaxAge")} /></div>
        <div className="field"><label htmlFor="ne-cap">Camp capacity</label><input id="ne-cap" className="input" type="number" min={0} max={100000} value={f.campCapacity} onChange={set("campCapacity")} /></div>
        <div className="field"><label htmlFor="ne-p1">Pick-up window from</label><input id="ne-p1" className="input" type="time" value={f.pickupStart} onChange={set("pickupStart")} /></div>
        <div className="field"><label htmlFor="ne-p2">Pick-up window to</label><input id="ne-p2" className="input" type="time" value={f.pickupEnd} onChange={set("pickupEnd")} /></div>
      </div>
      <ErrorAlert error={create.error} />
      <div className="row"><button className="btn btn-primary" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create edition"}</button>
        <span className="xs muted">Starts as a Draft, with every capability off and not visible to the public.</span></div>
    </form>
  );
}

export function EditionDetail() {
  const { editionId } = useParams({ from: "/editions/$editionId" });
  const { can, setEditionId } = useSession();
  const qc = useQueryClient();
  const canEdit = can("config:edit", false) || can("config:edit");
  const q = useQuery({ queryKey: ["edition", editionId], queryFn: () => api.get<Edition>(`edition/${editionId}`), retry: false });

  const [stageTarget, setStageTarget] = useState<EditionStage | null>(null);
  const [capTarget, setCapTarget] = useState<{ capability: string; enabled: boolean } | null>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["edition", editionId] });
    await qc.invalidateQueries({ queryKey: ["editions"] });
      await qc.invalidateQueries({ queryKey: ["my-editions"] });
    await qc.invalidateQueries({ queryKey: ["edition-list"] });
  };

  const transition = useMutation({
    mutationFn: (v: { to: EditionStage; reason: string }) => api.post(`edition/${editionId}/stage`, v),
    onSuccess: async () => { setStageTarget(null); await refresh(); },
  });
  const capability = useMutation({
    mutationFn: (v: { capability: string; enabled: boolean; reason: string }) => api.put(`edition/${editionId}/capability/${v.capability}`, { enabled: v.enabled, reason: v.reason }),
    onSuccess: async () => { setCapTarget(null); await refresh(); },
  });

  if (q.isLoading) return <Loading what="Loading edition" />;
  if (q.error instanceof ApiError && q.error.status === 403) return <Forbidden need="config:view" />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const e = q.data!;
  const stageIndex = e.stage ? STAGES.indexOf(e.stage) : -1;
  const options = nextStages(e.stage);
  const pricingBlocked = transition.error instanceof ApiError && transition.error.code === "pricing_not_published";

  return (
    <section>
      <div className="page-h">
        <div><p><Link to="/editions">← Event editions</Link></p><h1>{e.name}</h1><p>{formatDateRange(e.startsOn, e.endsOn)} · {e.timezone} · <span className="mono">{e.code}</span></p></div>
        <span className={`badge ${stageBadge(e.stage)}`}>{e.stage ? STAGE_LABEL[e.stage] : "Unknown"}</span>
      </div>

      <div className="grid g2">
        <div className="card stack-3">
          <div className="card-h"><h3>Lifecycle</h3></div>
          <ol className="stepper" aria-label="Edition lifecycle">
            {STAGES.map((s, i) => <li key={s} className={i < stageIndex ? "done" : i === stageIndex ? "cur" : undefined} aria-current={i === stageIndex ? "step" : undefined}>{STAGE_LABEL[s]}</li>)}
          </ol>
          {canEdit ? (
            <div className="row">
              {options.length === 0 ? <span className="muted sm">{e.stage === "Archived" ? "Archived editions stay as a record. Nothing is deleted." : "No moves available."}</span>
                : options.map((s) => (
                  <button key={s} className={`btn btn-sm ${s === "RegistrationOpen" || s === "Live" ? "btn-primary" : "btn-secondary"}`} onClick={() => { transition.reset(); setStageTarget(s); }}>
                    {STAGES.indexOf(s) < stageIndex ? `Back to ${STAGE_LABEL[s].toLowerCase()}` : `Move to ${STAGE_LABEL[s].toLowerCase()}`}</button>))}
            </div>
          ) : <p className="muted sm">You can view this edition. Changing it needs config:edit.</p>}
          <p className="xs muted">Opening registration needs a published price. A Free rule counts; no rule means “price not set”, which blocks it.</p>
        </div>

        <div className="card">
          <div className="card-h"><h3>Capabilities</h3></div>
          <div className="stack-2">
            {e.capabilities.map((c) => (
              <div className="row between" key={c.capability}>
                <span id={`cap-${c.capability}`}>{CAPABILITY_LABEL[c.capability] ?? c.capability}</span>
                <Switch on={c.enabled} label={CAPABILITY_LABEL[c.capability] ?? c.capability} disabled={!canEdit} onToggle={() => { capability.reset(); setCapTarget({ capability: c.capability, enabled: !c.enabled }); }} />
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: "var(--space-3)" }}>Switching a capability off removes its screens and API for this edition.</div>
        </div>
      </div>

      <EditionForm edition={e} canEdit={canEdit} onSaved={refresh} onUse={() => setEditionId(e.id)} />

      <ReasonDialog open={!!stageTarget} title={stageTarget ? `${STAGES.indexOf(stageTarget) < stageIndex ? "Move back to" : "Move to"} “${STAGE_LABEL[stageTarget]}”?` : ""}
        description={stageTarget === "RegistrationOpen" ? "Families will be able to start registrations straight away." : stageTarget === "Closed" ? "New registrations stop. Existing ones are unaffected." : undefined}
        confirmLabel="Confirm move" busy={transition.isPending} error={transition.error}
        onCancel={() => setStageTarget(null)} onConfirm={(reason) => stageTarget && transition.mutate({ to: stageTarget, reason })}>
        {pricingBlocked && <div className="alert warn"><div><b>No published price</b>Draft and publish rates first, then open registration. <Link to="/pricing">Go to Pricing</Link></div></div>}
      </ReasonDialog>

      <ReasonDialog open={!!capTarget} title={capTarget ? `Switch ${CAPABILITY_LABEL[capTarget.capability] ?? capTarget.capability} ${capTarget.enabled ? "on" : "off"}?` : ""}
        description={capTarget && !capTarget.enabled ? "Its screens and API disappear for this edition." : undefined}
        confirmLabel={capTarget?.enabled ? "Switch on" : "Switch off"} danger={capTarget ? !capTarget.enabled : false} busy={capability.isPending} error={capability.error}
        onCancel={() => setCapTarget(null)} onConfirm={(reason) => capTarget && capability.mutate({ ...capTarget, reason })} />
    </section>
  );
}

function EditionForm({ edition, canEdit, onSaved, onUse }: { edition: Edition; canEdit: boolean; onSaved: () => Promise<void>; onUse: () => void }) {
  const [f, setF] = useState({
    name: edition.name, minAge: edition.minAge?.toString() ?? "", maxAge: edition.maxAge?.toString() ?? "", campMinAge: edition.campMinAge?.toString() ?? "", campMaxAge: edition.campMaxAge?.toString() ?? "", campCapacity: edition.campCapacity?.toString() ?? "",
    pickupStart: timeValue(edition.pickupWindowStart), pickupEnd: timeValue(edition.pickupWindowEnd),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (input: UpdateEditionInput) => api.put(`edition/${edition.id}`, input),
    onSuccess: async () => { setSaved(true); await onSaved(); },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setSaved(false);
    save.mutate({
      name: f.name.trim(), minAge: intOrNull(f.minAge), maxAge: intOrNull(f.maxAge), campMinAge: intOrNull(f.campMinAge), campMaxAge: intOrNull(f.campMaxAge), campCapacity: intOrNull(f.campCapacity),
      pickupWindowStart: timeOrNull(f.pickupStart), pickupWindowEnd: timeOrNull(f.pickupEnd),
    });
  };

  return (
    <div className="grid g2" style={{ marginTop: "var(--space-4)" }}>
      <div className="card">
        <div className="card-h"><h3>Details</h3></div>
        <dl className="kv">
          <dt>Dates</dt><dd>{formatDateRange(edition.startsOn, edition.endsOn)} · {edition.timezone}</dd>
          <dt>Age reference date</dt><dd>{edition.ageReferenceDate}</dd>
          <dt>Venue</dt><dd>{edition.venue ? `${edition.venue.name}${edition.venue.address ? `, ${edition.venue.address}` : ""}` : <span className="muted">Not set</span>}</dd>
          <dt>Event days</dt><dd>{edition.days.map((d) => d.day).join(" · ")}</dd>
          <dt>Web address</dt><dd className="mono">{edition.slug}</dd>
        </dl>
        <p className="xs muted" style={{ marginTop: "var(--space-3)" }}>Dates, code and address are fixed once an edition exists: they are in every reference and receipt.</p>
        <button className="btn btn-ghost btn-sm" onClick={onUse}>Use this edition across the console</button>
      </div>
      <form className="card stack-3" onSubmit={submit} aria-labelledby="ed-form">
        <div className="card-h"><h3 id="ed-form">Settings</h3></div>
        <div className="field"><label htmlFor="ef-n">Name</label><input id="ef-n" className="input" required maxLength={200} value={f.name} onChange={set("name")} disabled={!canEdit} /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="ef-min">Minimum age <span className="muted">anyone younger cannot register</span></label><input id="ef-min" className="input" type="number" min={0} max={120} value={f.minAge} onChange={set("minAge")} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="ef-max">Maximum age <span className="muted">anyone older cannot register</span></label><input id="ef-max" className="input" type="number" min={0} max={120} value={f.maxAge} onChange={set("maxAge")} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="ef-a">Camp minimum age</label><input id="ef-a" className="input" type="number" min={0} max={120} value={f.campMinAge} onChange={set("campMinAge")} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="ef-b">Camp maximum age</label><input id="ef-b" className="input" type="number" min={0} max={120} value={f.campMaxAge} onChange={set("campMaxAge")} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="ef-c">Camp capacity</label><input id="ef-c" className="input" type="number" min={0} max={100000} value={f.campCapacity} onChange={set("campCapacity")} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="ef-p1">Pick-up from</label><input id="ef-p1" className="input" type="time" value={f.pickupStart} onChange={set("pickupStart")} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="ef-p2">Pick-up to</label><input id="ef-p2" className="input" type="time" value={f.pickupEnd} onChange={set("pickupEnd")} disabled={!canEdit} /></div>
        </div>
        <ErrorAlert error={save.error} />
        {saved && !save.error && <div className="alert ok" role="status"><div>Settings saved.</div></div>}
        {canEdit && <div className="row"><button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</button></div>}
      </form>
    </div>
  );
}
