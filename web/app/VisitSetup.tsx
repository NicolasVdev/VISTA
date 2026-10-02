import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import type { VistaFieldState, ZoneTemplate } from "./lib/vista-db";

export type VisitDetails = { propertyName: string; address: string; managerName: string; scheduledAt: string };
export default function VisitSetup({ mode, field, defaultRoute, onCreate, onSaveRoute }: {
  mode: "new" | "route"; field: VistaFieldState; defaultRoute: ZoneTemplate[];
  onCreate: (details: VisitDetails, route: ZoneTemplate[]) => Promise<boolean>;
  onSaveRoute: (route: ZoneTemplate[]) => Promise<boolean>;
}) {
  const [route, setRoute] = useState<ZoneTemplate[]>(() => mode === "new" ? defaultRoute.map((zone) => ({ ...zone, id: crypto.randomUUID() })) : field.zones.map((zone) => ({ id: zone.zoneId, label: zone.zoneLabel, hint: zone.hint ?? "" })));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const now = new Date(); const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  function change(id: string, changes: Partial<ZoneTemplate>) { setRoute((items) => items.map((zone) => zone.id === id ? { ...zone, ...changes } : zone)); }
  function move(index: number, delta: number) { setRoute((items) => { const copy = [...items]; [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]]; return copy; }); }
  function protectedZone(id: string) {
    return mode === "route" && (field.observations.some((item) => item.zoneId === id) || field.actions.some((item) => item.visitId === field.visit.id && item.zoneId === id) || field.drafts.some((item) => item.zoneId === id && (item.text.trim() || item.audio || item.photos.length)));
  }
  return <form className="visit-setup" onSubmit={async (event) => {
    event.preventDefault(); setError(""); const data = new FormData(event.currentTarget);
    if (!route.length || route.some((zone) => !zone.label.trim())) { setError("Nommez chaque zone et conservez au moins une zone."); return; }
    setBusy(true);
    const ok = mode === "new" ? await onCreate({ propertyName: String(data.get("propertyName") ?? ""), address: String(data.get("address") ?? ""), managerName: String(data.get("managerName") ?? ""), scheduledAt: new Date(String(data.get("scheduledAt"))).toISOString() }, route) : await onSaveRoute(route);
    if (!ok) setError("L’enregistrement n’a pas abouti. Vérifiez le message de VISTA et réessayez.");
    setBusy(false);
  }}>
    <h2>{mode === "new" ? "Nouvelle visite" : "Adapter le parcours"}</h2>
    <p className="muted">{mode === "new" ? "Partez de notre trame, sans paramétrer la copropriété." : "Les changements concernent uniquement cette visite. Les constats restent rattachés à leur zone."}</p>
    <fieldset disabled={busy}>
      {mode === "new" && <>
        <label className="form-field">Résidence<input name="propertyName" required maxLength={150} autoComplete="organization" /></label>
        <label className="form-field">Adresse<input name="address" required maxLength={250} autoComplete="street-address" /></label>
        <label className="form-field">Gestionnaire<input name="managerName" required maxLength={100} defaultValue={field.visit.managerName ?? ""} autoComplete="name" /></label>
        <label className="form-field">Date et heure de visite<input name="scheduledAt" type="datetime-local" required defaultValue={localDate} /></label>
      </>}
      <div className="section-title"><h3>Parcours · {route.length} zones</h3><small>Dans l’ordre de la visite</small></div>
      <div className="route-editor">{route.map((zone, index) => <article key={zone.id} className="route-editor-row">
        <label className="form-field">Zone {index + 1}<input aria-label={`Nom de la zone ${index + 1}`} value={zone.label} required maxLength={120} onChange={(event) => change(zone.id, { label: event.target.value })} /></label>
        <label className="form-field">Points à vérifier<input aria-label={`Points à vérifier de la zone ${index + 1}`} value={zone.hint} maxLength={300} onChange={(event) => change(zone.id, { hint: event.target.value })} /></label>
        <div className="route-editor-tools"><button type="button" className="plain-icon" disabled={index === 0} aria-label={`Monter la zone ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp size={18} aria-hidden="true" /></button><button type="button" className="plain-icon" disabled={index === route.length - 1} aria-label={`Descendre la zone ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown size={18} aria-hidden="true" /></button><button type="button" className="plain-icon" disabled={route.length === 1 || protectedZone(zone.id)} aria-label={`Retirer la zone ${index + 1}`} onClick={() => setRoute((items) => items.filter((item) => item.id !== zone.id))}><Trash2 size={18} aria-hidden="true" /></button>{protectedZone(zone.id) && <small>Contient des données : suppression protégée</small>}</div>
      </article>)}</div>
      <button type="button" className="secondary-action add-zone" disabled={route.length >= 100} onClick={() => setRoute((items) => [...items, { id: crypto.randomUUID(), label: "Nouvelle zone", hint: "" }])}><Plus size={20} aria-hidden="true" />Ajouter une zone</button>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="primary-action">{mode === "new" ? "Créer la visite" : "Enregistrer le parcours"}<Check size={20} aria-hidden="true" /></button>
    </fieldset>
  </form>;
}
