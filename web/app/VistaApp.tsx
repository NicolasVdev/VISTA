"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Ban, Camera, Check, ChevronDown, ChevronRight, CircleAlert, ClipboardList, Download, House, Images, ListChecks, LoaderCircle, MapPin, Mic, Pencil, Phone, Square, Trash2, X } from "lucide-react";
import { closeFieldVisit, createFieldVisit, deleteObservation, DEMO_VISIT_ID, loadFieldState, reopenFieldVisit, resetFieldState, restoreObservation, saveAction, saveDraft, saveObservation, saveProperty, saveVisit, saveVisitRoute, selectFieldVisit, saveZoneProgress, type FollowUpAction, type InaccessibleReason, type Severity, type VistaDraft, type VistaFieldState, type VistaMedia, type VistaObservation, type VistaProperty, type VistaZoneProgress, type ZoneStatus, type ZoneTemplate } from "./lib/vista-db";
import VisitSetup from "./VisitSetup";
import VisitExport from "./VisitExport";

type Screen = "home" | "visits" | "actions" | "visit" | "review";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DEFAULT_ZONES: ZoneTemplate[] = [
  { id: "toiture", label: "Toiture", hint: "Étanchéité, évacuations, équipements" },
  ...[6, 5, 4, 3, 2, 1].map((floor) => ({ id: `etage-${floor}`, label: floor === 1 ? "1er étage" : `${floor}e étage`, hint: "Palier, éclairage, portes, murs" })),
  { id: "rdc", label: "Rez-de-chaussée", hint: "Hall, boîtes aux lettres, accès" },
  { id: "sous-sol", label: "Sous-sol & parking", hint: "Sas, caves, parkings, électricité" },
];
const STATUS: Record<ZoneStatus, string> = { pending: "À contrôler", clear: "Rien à signaler", observed: "Constat", inaccessible: "Non accessible" };
const SEVERITY: Record<Severity, string> = { urgent: "Urgent", planned: "À planifier", info: "Pour info" };
const REASONS: Record<InaccessibleReason, string> = { missing_key: "Clé ou badge manquant", locked: "Local fermé", occupant_absent: "Occupant absent", unsafe: "Accès dangereux", other: "Autre" };
const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const hasContent = (draft?: VistaDraft) => Boolean(draft && (draft.text.trim() || draft.audio || draft.photos.length));
const emptyDraft = (visitId: string, zoneId: string): VistaDraft => ({ id: `${visitId}:${zoneId}`, visitId, zoneId, text: "", severity: "planned", photos: [] });
function zoneSeverity(observations: VistaObservation[], zoneId: string): Severity | undefined {
  const items = observations.filter((item) => item.zoneId === zoneId);
  return items.some((item) => item.severity === "urgent") ? "urgent" : items.some((item) => item.severity === "planned") ? "planned" : items.length ? "info" : undefined;
}
function visitRoute(field: VistaFieldState): ZoneTemplate[] { return field.zones.map((zone) => ({ id: zone.zoneId, label: zone.zoneLabel, hint: zone.hint ?? DEFAULT_ZONES.find((item) => item.id === zone.zoneId)?.hint ?? "" })); }

export default function VistaApp() {
  const [field, setField] = useState<VistaFieldState | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [zoneIndex, setZoneIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, VistaDraft>>({});
  const draftRef = useRef<Record<string, VistaDraft>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queue = useRef(Promise.resolve());
  const [writes, setWrites] = useState(0);
  const [draftPending, setDraftPending] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<"new" | "route" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [leftPending, setLeftPending] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ observation: VistaObservation; action?: FollowUpAction; expires: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStarting = useRef(false);
  const mounted = useRef(true);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const mediaZone = useRef("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(() => matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [installHidden, setInstallHidden] = useState(() => { try { return localStorage.getItem("vista-install-hidden") === "1"; } catch { return false; } });
  const visit = field?.visit;
  const ZONES = field ? visitRoute(field) : DEFAULT_ZONES;
  const zone = ZONES[zoneIndex];
  const draft = visit ? drafts[zone.id] ?? emptyDraft(visit.id, zone.id) : undefined;
  const readonly = visit?.status === "completed";
  const busy = writes > 0 || draftPending;

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => setOnline(navigator.onLine);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOnline);
    window.addEventListener("beforeinstallprompt", onInstall); window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    loadFieldState(DEFAULT_ZONES).then((state) => {
      if (!mounted.current) return;
      setField(state);
      draftRef.current = Object.fromEntries(state.drafts.map((item) => [item.zoneId, item]));
      setDrafts(draftRef.current);
      setZoneIndex(Math.max(0, state.zones.findIndex((item) => item.zoneId === state.visit.currentZoneId)));
    }).catch(() => setError("Le stockage local n’est pas disponible. Vérifiez les autorisations du navigateur."));
    return () => {
      mounted.current = false;
      window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOnline);
      window.removeEventListener("beforeinstallprompt", onInstall); window.removeEventListener("appinstalled", onInstalled);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.expires - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);

  // Serialize writes so a delayed draft cannot overwrite a submitted/editing draft.
  function write(operation: () => Promise<void>, switchVisit = false): Promise<boolean> {
    setWrites((count) => count + 1);
    const result = queue.current.then(async () => {
      try {
        await operation(); const state = await loadFieldState(DEFAULT_ZONES); setField(state);
        if (switchVisit) {
          draftRef.current = Object.fromEntries(state.drafts.map((item) => [item.zoneId, item])); setDrafts(draftRef.current);
          setZoneIndex(Math.max(0, state.zones.findIndex((item) => item.zoneId === state.visit.currentZoneId)));
          setUndo(null); setLeftPending(null);
        }
        setError(""); return true;
      }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible. Vos données saisies restent affichées ; réessayez."); return false; }
      finally { setWrites((count) => count - 1); }
    });
    queue.current = result.then(() => undefined);
    return result;
  }
  function flushDrafts() {
    for (const [zoneId, timer] of timers.current) {
      clearTimeout(timer);
      const value = draftRef.current[zoneId];
      if (value) void write(() => saveDraft(value));
    }
    timers.current.clear(); setDraftPending(false);
  }
  function changeDraft(zoneId: string, changes: Partial<VistaDraft>) {
    if (!visit || readonly) return;
    const next = { ...(draftRef.current[zoneId] ?? emptyDraft(visit.id, zoneId)), ...changes };
    draftRef.current = { ...draftRef.current, [zoneId]: next }; setDrafts(draftRef.current);
    clearTimeout(timers.current.get(zoneId)); setDraftPending(true);
    timers.current.set(zoneId, setTimeout(() => {
      timers.current.delete(zoneId); setDraftPending(timers.current.size > 0);
      void write(() => saveDraft(next));
    }, 400));
  }
  const flushHiddenDrafts = useEffectEvent(() => flushDrafts());
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") flushHiddenDrafts(); };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  function navigate(index: number, warn = false) {
    if (!visit) return;
    if (recording) recorder.current?.stop();
    flushDrafts();
    setLeftPending(warn && field?.zones[zoneIndex]?.status === "pending" ? zoneIndex : null);
    const bounded = Math.max(0, Math.min(index, ZONES.length - 1));
    setZoneIndex(bounded); setScreen("visit"); setZonesOpen(false);
    void write(() => saveVisit({ ...visit, currentZoneId: ZONES[bounded].id }));
  }
  async function start() {
    if (!visit) return;
    if (readonly) { setScreen("review"); return; }
    if (visit.status === "planned" && !await write(() => saveVisit({ ...visit, status: "in_progress", updatedAt: new Date().toISOString() }))) return;
    setScreen("visit");
  }
  function backHome() { if (recording) recorder.current?.stop(); flushDrafts(); setScreen("home"); }
  function nextZone() {
    if (zoneIndex < ZONES.length - 1) navigate(zoneIndex + 1, true);
    else { if (recording) recorder.current?.stop(); flushDrafts(); setScreen("review"); setLeftPending(null); }
  }
  function setStatus(status: ZoneStatus, reason?: InaccessibleReason) {
    const progress = field?.zones[zoneIndex];
    if (!progress || readonly) return;
    void write(() => saveZoneProgress({ ...progress, status, inaccessibleReason: reason, updatedAt: new Date().toISOString() }));
  }
  async function submit() {
    if (!visit || !draft || !hasContent(draft) || recording || readonly || writes > 0) return;
    flushDrafts();
    const original = field?.observations.find((item) => item.id === draft.editingId);
    const now = new Date().toISOString();
    const observation: VistaObservation = { id: original?.id ?? crypto.randomUUID(), visitId: visit.id, zoneId: zone.id, zoneLabel: zone.label,
      createdAt: original?.createdAt ?? now, updatedAt: now, text: draft.text.trim() || undefined, audio: draft.audio,
      photos: draft.photos, severity: draft.severity, createAction: original?.createAction ?? draft.severity !== "info", syncStatus: "local" };
    const cleared = emptyDraft(visit.id, zone.id);
    if (await write(() => saveObservation(observation, true))) {
      draftRef.current = { ...draftRef.current, [zone.id]: cleared }; setDrafts(draftRef.current);
    }
  }
  function edit(observation: VistaObservation) {
    changeDraft(observation.zoneId, { text: observation.text ?? "", audio: observation.audio, photos: observation.photos, severity: observation.severity ?? "info", editingId: observation.id });
  }
  async function remove(observation: VistaObservation) {
    let action: FollowUpAction | undefined;
    if (await write(async () => { action = await deleteObservation(observation); })) {
      if (draftRef.current[observation.zoneId]?.editingId === observation.id) changeDraft(observation.zoneId, emptyDraft(observation.visitId, observation.zoneId));
      setUndo({ observation, action, expires: Date.now() + 5000 });
    }
  }
  function toggleAction(observation: VistaObservation) { void write(() => saveObservation({ ...observation, createAction: !observation.createAction, updatedAt: new Date().toISOString() })); }
  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); return; }
    if (!visit || readonly || recordingStarting.current) return;
    const origin = zone.id;
    recordingStarting.current = true;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const device = new MediaRecorder(stream); const chunks: Blob[] = [];
      recorder.current = device;
      device.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      device.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop());
        setRecording(false); setSeconds(0);
        const blob = new Blob(chunks, { type: device.mimeType || "audio/webm" });
        if (blob.size && mounted.current) changeDraft(origin, { audio: { id: crypto.randomUUID(), blob, mimeType: blob.type, fileName: `note-${Date.now()}.${blob.type.includes("mp4") ? "m4a" : "webm"}`, createdAt: new Date().toISOString() } });
      };
      device.start(); setSeconds(0); setRecording(true); setError("");
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setError("Autorisez le microphone dans votre navigateur pour enregistrer une note vocale.");
    } finally { recordingStarting.current = false; }
  }
  function importPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")); event.target.value = "";
    if (!files.length) return;
    const origin = mediaZone.current;
    const photos = files.map((file): VistaMedia => ({ id: crypto.randomUUID(), blob: file, mimeType: file.type, fileName: file.name, createdAt: new Date().toISOString() }));
    changeDraft(origin, { photos: [...(draftRef.current[origin]?.photos ?? []), ...photos] });
  }
  function pickPhoto(kind: "camera" | "library") { mediaZone.current = zone.id; (kind === "camera" ? camera : library).current?.click(); }
  async function install() {
    if (!installPrompt) { setInstallHelp(true); return; }
    await installPrompt.prompt(); const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true); setInstallPrompt(null);
  }
  function hideInstall() { setInstallHidden(true); try { localStorage.setItem("vista-install-hidden", "1"); } catch { /* The advice can still be dismissed for this session. */ } }
  async function reset() {
    flushDrafts();
    if (await write(async () => { await resetFieldState(DEFAULT_ZONES); }, true)) {
      draftRef.current = {}; setDrafts({}); setUndo(null); setZoneIndex(0); setScreen("home");
    }
  }

  return <main className={`vista-shell ${screen === "visit" ? "visit-mode" : ""}`}>
    {screen !== "visit" && !online && <div className="offline-banner">Hors connexion · vos données restent sur cet appareil</div>}
    {screen !== "visit" && error && <div className="error-banner" role="alert">{error}</div>}
    {!field && <p role="status">Chargement de la visite…</p>}
    {field && screen === "visit" && draft && <FieldScreen field={field} zoneIndex={zoneIndex} draft={draft} busy={busy} error={error} online={online} recording={recording} seconds={seconds}
      warning={leftPending !== null && field.zones[leftPending]?.status === "pending" ? leftPending : null}
      onBack={backHome} onZones={() => setZonesOpen(true)} onNavigate={navigate} onNext={nextZone} onStatus={setStatus}
      onDraft={(changes) => changeDraft(zone.id, changes)} onSubmit={submit} onRecord={toggleRecording} onPhoto={pickPhoto}
      onEdit={edit} onDelete={remove} onAction={toggleAction} />}
    {field && screen === "review" && <ReviewScreen field={field} busy={busy} recording={recording} drafts={drafts} onBack={() => setScreen("visit")} onZone={navigate} onAction={toggleAction}
      onClose={async () => { flushDrafts(); if (await write(() => closeFieldVisit(field.visit.id))) setUndo(null); }}
      onReopen={async () => { if (await write(() => reopenFieldVisit(field.visit.id))) setScreen("visit"); }} onActions={() => setScreen("actions")} onReset={reset} onExport={async () => { flushDrafts(); if (await write(async () => {})) setExportOpen(true); }} />}
    {field && ["home", "visits", "actions"].includes(screen) && <>
      <header className="vista-header"><div className="vista-brand"><span className="vista-mark">V</span>VISTA</div><Saved busy={busy} error={error} label={online ? "À jour" : "Hors connexion"} /></header>
      {screen === "home" && <HomeScreen field={field} onStart={start} showInstall={!installed && !installHidden} onInstall={install} onHideInstall={hideInstall} onSaveProperty={(property) => write(() => saveProperty(property))} onActions={() => setScreen("actions")} onNew={() => setSetupMode("new")} onRoute={() => { flushDrafts(); setSetupMode("route"); }} />}
      {screen === "visits" && <section className="secondary-screen"><p className="eyebrow">Historique local</p><h1>Visites</h1><button className="secondary-action add-zone" onClick={() => setSetupMode("new")}>Nouvelle visite</button><div className="visit-history">{field.visits.map((item) => <button key={item.id} className="list-card" disabled={busy} onClick={async () => { flushDrafts(); if (await write(() => selectFieldVisit(item.id), true)) setScreen("home"); }}><span className="date-tile">{new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(item.scheduledAt))}<strong>{new Date(item.scheduledAt).getDate()}</strong></span><span><strong>{item.propertyName}</strong><small>{item.status === "completed" ? "Clôturée" : item.status === "in_progress" ? "En cours" : "Planifiée"}{item.id === field.visit.id ? " · sélectionnée" : ""}</small></span><ChevronRight aria-hidden="true" /></button>)}</div></section>}
      {screen === "actions" && <ActionsScreen field={field} onSave={(action) => write(() => saveAction(action))} />}
      <nav className="bottom-nav" aria-label="Navigation principale">{([{ id: "home", label: "Accueil", Icon: House }, { id: "visits", label: "Visites", Icon: ClipboardList }, { id: "actions", label: "Actions", Icon: ListChecks }] as const).map(({ id, label, Icon }) => <button key={id} aria-current={screen === id ? "page" : undefined} className={screen === id ? "active" : ""} onClick={() => setScreen(id)}><Icon size={22} aria-hidden="true" /><span>{label}</span></button>)}</nav>
    </>}
    <input ref={camera} className="visually-hidden" type="file" accept="image/*" capture="environment" aria-label="Prendre une photo" onChange={importPhotos} />
    <input ref={library} className="visually-hidden" type="file" accept="image/*" multiple aria-label="Importer des photos" onChange={importPhotos} />
    {undo && <div className="undo-toast" role="status">Constat supprimé<button onClick={async () => { if (Date.now() >= undo.expires) return; if (await write(() => restoreObservation(undo.observation, undo.action))) setUndo(null); }}>Annuler</button></div>}
    {zonesOpen && field && <Sheet title="Toutes les zones" onClose={() => setZonesOpen(false)}><h2>Zones</h2><p>{field.zones.filter((item) => item.status !== "pending").length} sur {ZONES.length} renseignées</p><ZoneList field={field} drafts={drafts} current={zoneIndex} onZone={navigate} /></Sheet>}
    {setupMode && field && <Sheet title={setupMode === "new" ? "Nouvelle visite" : "Adapter le parcours"} onClose={() => setSetupMode(null)}><VisitSetup mode={setupMode} field={field} defaultRoute={DEFAULT_ZONES} onCreate={async (details, route) => { flushDrafts(); const ok = await write(async () => { await createFieldVisit(details, route); }, true); if (ok) { setSetupMode(null); setScreen("home"); } return ok; }} onSaveRoute={async (route) => { flushDrafts(); const ok = await write(() => saveVisitRoute(field.visit.id, route), true); if (ok) setSetupMode(null); return ok; }} /></Sheet>}
    {exportOpen && field && <Sheet title="Compte rendu et sauvegarde" onClose={() => setExportOpen(false)}><VisitExport field={field} /></Sheet>}
    {installHelp && <Sheet title="Installer VISTA" onClose={() => setInstallHelp(false)}><span className="large-mark">V</span><h2>VISTA à portée de main</h2><p>Ajoutez l’application à l’écran d’accueil pour la lancer comme une app.</p><ol><li>Ouvrez VISTA dans Safari sur iPhone, ou votre navigateur habituel sur Android.</li><li>Dans le menu Partager ou ⋮, choisissez « Ajouter à l’écran d’accueil » ou « Installer ».</li><li>Lancez VISTA une première fois avec une connexion pour préparer le mode hors ligne.</li></ol><p>Les visites sont stockées sur cet appareil. Effacer les données du navigateur les supprime.</p><button className="primary-action" onClick={() => setInstallHelp(false)}>Compris<Check aria-hidden="true" /></button></Sheet>}
  </main>;
}

function Saved({ busy, error, label = "Enregistré" }: { busy: boolean; error: string; label?: string }) {
  return <span className={`saved-pill ${error ? "has-error" : ""}`} role="status" title="Enregistrement local sur cet appareil, sans synchronisation serveur">{busy ? <LoaderCircle className="saving-spinner" size={16} aria-hidden="true" /> : error ? <CircleAlert size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}<span>{busy ? "Enregistrement…" : error ? "Non enregistré" : label}</span></span>;
}
function StatusIcon({ zone, count, severity }: { zone: VistaZoneProgress; count: number; severity?: Severity }) {
  return <span className={`zone-dot status-${zone.status} ${zone.status === "observed" && severity ? `priority-${severity}` : ""}`} aria-hidden="true">{zone.status === "clear" ? <Check size={16} /> : zone.status === "inaccessible" ? <Ban size={16} /> : zone.status === "observed" ? count : null}</span>;
}
function Segments({ zones, observations, current }: { zones: VistaZoneProgress[]; observations: VistaObservation[]; current?: number }) {
  return <div className="segments" aria-hidden="true">{zones.map((zone, index) => <span key={zone.id} className={`segment segment-${zone.status} ${zone.status === "observed" ? `priority-${zoneSeverity(observations, zone.zoneId) ?? "info"}` : ""} ${index === current ? "current" : ""}`} />)}</div>;
}
function ZoneList({ field, drafts, current, onZone }: { field: VistaFieldState; drafts: Record<string, VistaDraft>; current?: number; onZone: (index: number) => void }) {
  return <div className="zone-review-list">{field.zones.map((zone, index) => {
    const items = field.observations.filter((item) => item.zoneId === zone.zoneId); const urgent = items.filter((item) => item.severity === "urgent").length;
    const severity = zoneSeverity(items, zone.zoneId);
    const detail = zone.status === "observed" ? `${items.length} constat${items.length > 1 ? "s" : ""}${urgent ? ` · ${urgent} urgent${urgent > 1 ? "s" : ""}` : ` · ${SEVERITY[severity ?? "info"]}`}` : zone.status === "pending" && hasContent(drafts[zone.zoneId]) ? "Brouillon en cours" : `${STATUS[zone.status]}${zone.inaccessibleReason ? ` · ${REASONS[zone.inaccessibleReason]}` : ""}`;
    return <button key={zone.id} onClick={() => onZone(index)} aria-current={index === current ? "step" : undefined}><StatusIcon zone={zone} count={items.length} severity={severity} /><span><strong>{zone.zoneLabel}</strong><small className={urgent ? "urgent-text" : zone.status === "inaccessible" ? "inaccessible-text" : ""}>{detail}</small></span>{index === current && <b className="here-pill">Ici</b>}<ChevronRight size={18} aria-hidden="true" /></button>;
  })}</div>;
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const close = useEffectEvent(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const sheet = ref.current;
    const focusables = () => Array.from(sheet?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href], [tabindex="0"]') ?? []);
    focusables()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const list = focusables(); const first = list[0]; const last = list.at(-1);
        if (!list.length) { event.preventDefault(); sheet?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const keepInside = (event: FocusEvent) => { if (sheet && !sheet.contains(event.target as Node)) focusables()[0]?.focus(); };
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    document.addEventListener("keydown", trap); document.addEventListener("focusin", keepInside);
    return () => { document.removeEventListener("keydown", trap); document.removeEventListener("focusin", keepInside); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="sheet-backdrop"><button className="sheet-dismiss" aria-label="Fermer la fenêtre" onClick={onClose} /><div ref={ref} className="install-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><span className="sheet-handle" /><button className="sheet-close" aria-label="Fermer" onClick={onClose}><X size={22} aria-hidden="true" /></button>{children}</div></div>;
}
function Media({ item, photo = false }: { item: VistaMedia; photo?: boolean }) {
  const ref = useRef<HTMLImageElement & HTMLAudioElement>(null);
  useEffect(() => { const value = URL.createObjectURL(item.blob); if (ref.current) ref.current.src = value; return () => URL.revokeObjectURL(value); }, [item.blob]);
  // These are the user's raw voice notes; a transcript will arrive with the AI lot.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return photo ? <img ref={ref} alt="Pièce jointe du constat" /> : <audio ref={ref} controls aria-label="Note vocale du constat" />;
}
function ObservationCard({ item, readonly, onAction, onEdit, onDelete, showZone = false }: { item: VistaObservation; readonly: boolean; onAction: (item: VistaObservation) => void; onEdit?: (item: VistaObservation) => void; onDelete?: (item: VistaObservation) => void; showZone?: boolean }) {
  return <article className="capture-card observation-card"><div className="capture-meta"><b className={`severity sev-${item.severity ?? "info"}`}>{SEVERITY[item.severity ?? "info"]}</b><span>{showZone ? item.zoneLabel : formatTime(item.createdAt)}</span></div>
    {item.text && <p>{item.text}</p>}{item.audio && <Media item={item.audio} />}{item.photos.length > 0 && <div className="observation-photos">{item.photos.map((photo) => <Media key={photo.id} item={photo} photo />)}</div>}
    {showZone && (item.audio || item.photos.length > 0) && <p className="media-count">{item.audio ? "1 note vocale" : ""}{item.audio && item.photos.length ? " · " : ""}{item.photos.length ? `${item.photos.length} photo${item.photos.length > 1 ? "s" : ""}` : ""}</p>}
    {!readonly && <div className="observation-controls"><label><input type="checkbox" checked={Boolean(item.createAction)} onChange={() => onAction(item)} />Créer une action de suivi</label><div>{onEdit && <button className="plain-icon" aria-label="Modifier le constat" onClick={() => onEdit(item)}><Pencil size={18} aria-hidden="true" /></button>}{onDelete && <button className="plain-icon" aria-label="Supprimer le constat" onClick={() => onDelete(item)}><Trash2 size={18} aria-hidden="true" /></button>}</div></div>}
  </article>;
}

function FieldScreen({ field, zoneIndex, draft, busy, error, online, recording, seconds, warning, onBack, onZones, onNavigate, onNext, onStatus, onDraft, onSubmit, onRecord, onPhoto, onEdit, onDelete, onAction }: {
  field: VistaFieldState; zoneIndex: number; draft: VistaDraft; busy: boolean; error: string; online: boolean; recording: boolean; seconds: number; warning: number | null;
  onBack: () => void; onZones: () => void; onNavigate: (index: number) => void; onNext: () => void; onStatus: (status: ZoneStatus, reason?: InaccessibleReason) => void;
  onDraft: (changes: Partial<VistaDraft>) => void; onSubmit: () => void; onRecord: () => void; onPhoto: (kind: "camera" | "library") => void;
  onEdit: (item: VistaObservation) => void; onDelete: (item: VistaObservation) => void; onAction: (item: VistaObservation) => void;
}) {
  const ZONES = visitRoute(field);
  const zone = ZONES[zoneIndex]; const progress = field.zones[zoneIndex];
  const items = field.observations.filter((item) => item.zoneId === zone.id);
  const readonly = field.visit.status === "completed"; const content = hasContent(draft);
  const root = useRef<HTMLElement>(null); const textarea = useRef<HTMLTextAreaElement>(null); const menu = useRef<HTMLDivElement>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false); const [keyboardOpen, setKeyboardOpen] = useState(false);
  useLayoutEffect(() => { const input = textarea.current; if (input) { input.style.height = "0px"; input.style.height = `${Math.min(120, Math.max(48, input.scrollHeight))}px`; input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden"; } }, [draft.text, draft.editingId, zoneIndex]);
  useEffect(() => {
    const viewport = window.visualViewport; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const sync = () => { root.current?.style.setProperty("--field-height", `${viewport?.height ?? innerHeight}px`); root.current?.style.setProperty("--field-top", `${viewport?.offsetTop ?? 0}px`); setKeyboardOpen(innerHeight - (viewport?.height ?? innerHeight) > 140); };
    sync(); viewport?.addEventListener("resize", sync); viewport?.addEventListener("scroll", sync); window.addEventListener("resize", sync);
    return () => { document.body.style.overflow = overflow; viewport?.removeEventListener("resize", sync); viewport?.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
  }, []);
  useEffect(() => {
    if (!attachmentOpen) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setAttachmentOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setAttachmentOpen(false); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [attachmentOpen]);
  return <section ref={root} className={`field-screen ${keyboardOpen ? "keyboard-open" : ""}`}>
    {!online && <div className="field-offline">Hors connexion · enregistrement sur cet appareil</div>}
    <div className="field-content"><header className="field-header"><button className="icon-button" aria-label="Retour à l’accueil" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button><button className="zone-selector" onClick={onZones} aria-haspopup="dialog"><small>{field.visit.propertyName}</small><strong>Zone {zoneIndex + 1} sur {ZONES.length}<ChevronDown size={16} aria-hidden="true" /></strong></button><Saved busy={busy} error={error} /></header>
      <Segments zones={field.zones} observations={field.observations} current={zoneIndex} />
      {error && <div className="error-banner" role="alert">{error}</div>}
      {warning !== null && <div className="pending-banner" role="status"><span><strong>{ZONES[warning].label}</strong> reste à contrôler</span><button onClick={() => onNavigate(warning)}>Y revenir</button></div>}
      <div className="zone-heading">{readonly && <p className="readonly-pill">Visite clôturée · lecture seule</p>}<h1>{zone.label}</h1><p>{zone.hint}</p></div>
      <section className="zone-status-card"><div><span>Statut de la zone</span><b className={`zone-status status-${progress.status} ${progress.status === "observed" ? `priority-${zoneSeverity(items, zone.id) ?? "info"}` : ""}`}><StatusIcon zone={progress} count={items.length} severity={zoneSeverity(items, zone.id)} />{progress.status === "observed" ? SEVERITY[zoneSeverity(items, zone.id) ?? "info"] : STATUS[progress.status]}</b></div>
        {!readonly && (items.length ? <p className="status-explanation">Statut fixé par {items.length === 1 ? "votre constat. Supprimez-le" : `vos ${items.length} constats. Supprimez-les`} pour indiquer « Rien à signaler » ou « Non accessible ».</p> : <div className="zone-status-actions"><button aria-pressed={progress.status === "clear"} className={progress.status === "clear" ? "active" : ""} onClick={() => onStatus(progress.status === "clear" ? "pending" : "clear")}><Check size={18} aria-hidden="true" />Rien à signaler</button><button aria-pressed={progress.status === "inaccessible"} className={progress.status === "inaccessible" ? "active inaccessible" : ""} onClick={() => onStatus(progress.status === "inaccessible" ? "pending" : "inaccessible")}><Ban size={18} aria-hidden="true" />Non accessible</button></div>)}
        {progress.status === "inaccessible" && !readonly && <div className="reason-section"><strong>Pourquoi ?</strong><p>Facultatif · repris dans le futur compte rendu</p><div className="reason-pills">{(Object.entries(REASONS) as [InaccessibleReason, string][]).map(([key, label]) => <button key={key} aria-pressed={progress.inaccessibleReason === key} onClick={() => onStatus("inaccessible", progress.inaccessibleReason === key ? undefined : key)}>{label}</button>)}</div></div>}
        {readonly && progress.inaccessibleReason && <p>{REASONS[progress.inaccessibleReason]}</p>}
      </section>
      <section className="capture-feed">{items.length > 0 && <h2>{items.length} constat{items.length > 1 ? "s" : ""}</h2>}{items.map((item) => <ObservationCard key={item.id} item={item} readonly={readonly} onAction={onAction} onEdit={onEdit} onDelete={onDelete} />)}
        {!readonly && !items.length && !content && progress.status === "pending" && <div className="empty-capture"><Mic size={24} aria-hidden="true" /><p><strong>Un constat ?</strong> Dictez-le, photographiez-le ou écrivez-le ci-dessous. Sinon, choisissez un statut.</p></div>}
      </section>
    </div>
    <footer className="composer-wrap">{!readonly && <>
      {recording && <div className="recording-bar" role="status"><i />Enregistrement · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}<span>Appuyez sur Stop pour terminer</span></div>}
      {draft.editingId && <div className="editing-note">Modification du constat<button onClick={() => onDraft(emptyDraft(draft.visitId, draft.zoneId))}>Annuler</button></div>}
      {(draft.audio || draft.photos.length > 0) && <><p className="composer-context">Le texte accompagne votre note vocale et vos photos.</p><div className="draft-attachments">{draft.audio && <div className="draft-audio"><Media item={draft.audio} /><button aria-label="Retirer la note vocale" onClick={() => onDraft({ audio: undefined })}><X size={18} aria-hidden="true" /></button></div>}<div className="draft-photos">{draft.photos.map((photo) => <div key={photo.id}><Media item={photo} photo /><button aria-label="Retirer la photo" onClick={() => onDraft({ photos: draft.photos.filter((item) => item.id !== photo.id) })}><X size={18} aria-hidden="true" /></button></div>)}</div></div></>}
      {content && <div className="severity-options" role="group" aria-label="Gravité du constat">{(Object.keys(SEVERITY) as Severity[]).map((value) => <button key={value} className={`sev-${value}`} aria-pressed={draft.severity === value} onClick={() => onDraft({ severity: value })}>{SEVERITY[value]}</button>)}</div>}
      <div className={`composer ${content ? "has-draft" : ""}`}><div className="attachment-control" ref={menu}><button className="composer-tool" aria-label="Ajouter une photo ou une note vocale" aria-expanded={attachmentOpen} onClick={() => setAttachmentOpen(!attachmentOpen)}><Camera size={22} aria-hidden="true" /></button>{attachmentOpen && <div className="attachment-menu"><button onClick={() => { setAttachmentOpen(false); onPhoto("camera"); }}><Camera size={20} aria-hidden="true" />Prendre une photo</button><button onClick={() => { setAttachmentOpen(false); onPhoto("library"); }}><Images size={20} aria-hidden="true" />Importer des photos</button>{content && <button onClick={() => { setAttachmentOpen(false); onRecord(); }} disabled={recording}><Mic size={20} aria-hidden="true" />{draft.audio ? "Remplacer la note vocale" : "Ajouter une note vocale"}</button>}</div>}</div>
        <textarea ref={textarea} rows={1} value={draft.text} aria-label="Décrire un constat" placeholder="Décrire un constat…" onChange={(event) => onDraft({ text: event.target.value })} />
        {recording || !content ? <button className={`mic-button ${recording ? "recording" : ""}`} aria-label={recording ? "Arrêter l’enregistrement" : "Enregistrer une note vocale"} onClick={onRecord}>{recording ? <Square size={20} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}</button> : <button className="send-button" disabled={busy} aria-label={draft.editingId ? "Enregistrer les modifications" : "Ajouter le constat"} onClick={onSubmit}>{busy ? <LoaderCircle size={22} className="saving-spinner" aria-hidden="true" /> : <Check size={23} aria-hidden="true" />}</button>}
      </div>
    </>}
      <div className="zone-navigation"><button disabled={zoneIndex === 0} onClick={() => onNavigate(zoneIndex - 1)}><ArrowLeft size={18} aria-hidden="true" />Précédente</button><button className="next-zone" onClick={onNext}><span><small>{zoneIndex === ZONES.length - 1 ? "Dernière zone" : "Zone suivante"}</small><strong>{zoneIndex === ZONES.length - 1 ? "Vérifier la visite" : ZONES[zoneIndex + 1].label}</strong></span><ArrowRight size={18} aria-hidden="true" /></button></div>
    </footer>
  </section>;
}

function HomeScreen({ field, onStart, showInstall, onInstall, onHideInstall, onSaveProperty, onActions, onNew, onRoute }: { field: VistaFieldState; onStart: () => void; showInstall: boolean; onInstall: () => void; onHideInstall: () => void; onSaveProperty: (property: VistaProperty) => Promise<boolean>; onActions: () => void; onNew: () => void; onRoute: () => void }) {
  const [editingProperty, setEditingProperty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { visit, zones, actions, property } = field;
  const openActions = actions.filter((item) => (item.propertyId ? item.propertyId === property.id : item.propertyName === property.name) && item.status === "open");
  const open = openActions.length; const urgent = openActions.filter((item) => item.severity === "urgent").length;
  const selected = field.observations.filter((item) => item.createAction).length;
  const phone = property.guardianPhone?.replace(/[^+\d]/g, "");
  const today = new Date(visit.scheduledAt).toDateString() === new Date().toDateString();
  return <><section className="welcome-block"><p className="eyebrow">{formatDate(new Date().toISOString())}</p><h1>{visit.managerName ? `Bonjour ${visit.managerName.split(" ")[0]}` : "Vos visites terrain"}</h1><p>{today ? "Visite sélectionnée aujourd’hui" : "Votre visite sélectionnée"}{visit.id === DEMO_VISIT_ID ? " · démonstration" : ""}</p><button className="text-button" onClick={onNew}>Nouvelle visite</button></section>
    <section className="visit-card"><div className="visit-card-topline"><span className="visit-tag">À {formatTime(visit.scheduledAt)}</span><span className="visit-type">{visit.status === "completed" ? "Visite clôturée" : "Visite technique"}</span></div><div className="residence-heading"><div><h2>{visit.propertyName}</h2><p>{visit.address}</p></div><a className="icon-button" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(visit.address)}`} target="_blank" rel="noreferrer" aria-label="Itinéraire vers la résidence"><MapPin size={20} aria-hidden="true" /></a></div>
      <section className="property-access" aria-label="Accès et contacts de la copropriété"><div className="access-heading"><strong>Accès et contacts</strong><button className="text-button" onClick={() => setEditingProperty(true)}><Pencil size={16} aria-hidden="true" />{property.guardianName || property.guardianPhone || property.accessCodes || property.usefulInfo ? "Modifier les accès" : "Renseigner les accès"}</button></div>
        {property.guardianName || property.guardianPhone ? <div className="property-detail"><strong>Gardien</strong><div><span>{property.guardianName || "Contact de la résidence"}</span>{property.guardianPhone && (phone && /\d/.test(phone) ? <a className="guardian-phone" href={`tel:${phone}`}><Phone size={16} aria-hidden="true" />{property.guardianPhone}</a> : <span>{property.guardianPhone}</span>)}</div></div> : null}
        {property.accessCodes && <div className="property-detail"><strong>Codes</strong><span className="access-copy">{property.accessCodes}</span></div>}
        {property.usefulInfo && <div className="property-detail"><strong>Infos utiles</strong><span className="access-copy">{property.usefulInfo}</span></div>}
        {!property.guardianName && !property.guardianPhone && !property.accessCodes && !property.usefulInfo && <p className="access-empty">Ajoutez le gardien, son téléphone, les codes et les consignes utiles sur place.</p>}
      </section>
      <button className="property-followup" onClick={onActions}><ListChecks size={19} aria-hidden="true" /><span><strong>Suivi des actions</strong><small>{open ? `${open} action${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""} à vérifier` : "Aucune action ouverte"}{urgent ? ` · ${urgent} urgente${urgent > 1 ? "s" : ""}` : ""}</small>{visit.status !== "completed" && selected > 0 && <small>{selected} action(s) sélectionnée(s) pour la clôture de cette visite</small>}</span><ChevronRight size={19} aria-hidden="true" /></button>
      <div className="zone-overview"><strong>{zones.length} zones</strong><span>{zones[0]?.zoneLabel} → {zones.at(-1)?.zoneLabel}</span></div><Segments zones={zones} observations={field.observations} /><div className="severity-legend" aria-label="Repères de gravité"><span className="legend-urgent">Urgent</span><span className="legend-planned">À planifier</span><span className="legend-info">Pour info</span></div>{visit.status !== "completed" && <button className="text-button route-edit-link" onClick={onRoute}><Pencil size={16} aria-hidden="true" />Adapter le parcours de cette visite</button>}<button className="primary-action" onClick={onStart}>{visit.status === "completed" ? "Consulter la visite" : visit.status === "in_progress" ? "Reprendre la visite" : "Commencer la visite"}<ArrowRight size={20} aria-hidden="true" /></button>
    </section>
    {showInstall && <aside className="install-card"><span className="install-icon"><Download size={22} aria-hidden="true" /></span><div><strong>Travailler sans réseau</strong><small>Installez VISTA sur l’écran d’accueil</small></div><button className="text-button" onClick={onInstall}>Installer</button><button className="plain-icon" aria-label="Masquer ce conseil" onClick={onHideInstall}><X size={18} aria-hidden="true" /></button></aside>}
    {editingProperty && <Sheet title="Accès de la copropriété" onClose={() => setEditingProperty(false)}><h2>Accès et contacts</h2><p>{property.name}</p><form onSubmit={async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const value = (key: string) => String(data.get(key) ?? "").trim() || undefined;
      setSubmitting(true);
      if (await onSaveProperty({ ...property, guardianName: value("guardianName"), guardianPhone: value("guardianPhone"), accessCodes: value("accessCodes"), usefulInfo: value("usefulInfo"), updatedAt: new Date().toISOString() })) setEditingProperty(false);
      setSubmitting(false);
    }}><label className="form-field">Gardien / contact<input name="guardianName" defaultValue={property.guardianName} autoComplete="off" /></label><label className="form-field">Téléphone du gardien<input name="guardianPhone" type="tel" defaultValue={property.guardianPhone} autoComplete="off" /></label><label className="form-field">Codes d’accès<textarea name="accessCodes" rows={3} defaultValue={property.accessCodes} autoComplete="off" placeholder="Une ligne par entrée, portail ou bâtiment" /></label><label className="form-field">Informations utiles<textarea name="usefulInfo" rows={3} defaultValue={property.usefulInfo} placeholder="Horaires du gardien, clés, accès parking, consignes…" /></label><p className="privacy-note">Conservé uniquement sur cet appareil pour la démo, sans chiffrement applicatif. Évitez les codes réels sur un appareil partagé.</p><button className="primary-action" disabled={submitting}>Enregistrer les accès<Check size={20} aria-hidden="true" /></button></form></Sheet>}
  </>;
}

function ReviewScreen({ field, busy, recording, drafts, onBack, onZone, onAction, onClose, onReopen, onActions, onReset, onExport }: { field: VistaFieldState; busy: boolean; recording: boolean; drafts: Record<string, VistaDraft>; onBack: () => void; onZone: (index: number) => void; onAction: (item: VistaObservation) => void; onClose: () => Promise<void>; onReopen: () => Promise<void>; onActions: () => void; onReset: () => Promise<void>; onExport: () => void }) {
  const [confirmation, setConfirmation] = useState<"close" | "reset" | null>(null);
  const { visit, zones, observations } = field; const readonly = visit.status === "completed";
  const pending = zones.filter((item) => item.status === "pending"); const selected = observations.filter((item) => item.createAction).length;
  const actionCopy = selected ? `${selected} action${selected > 1 ? "s seront ajoutées" : " sera ajoutée"} au suivi.` : "Aucune action ne sera créée.";
  const sorted = [...observations].sort((a, b) => ({ urgent: 0, planned: 1, info: 2 }[a.severity ?? "info"] - { urgent: 0, planned: 1, info: 2 }[b.severity ?? "info"]) || zones.findIndex((zone) => zone.zoneId === a.zoneId) - zones.findIndex((zone) => zone.zoneId === b.zoneId));
  const unsent = Object.values(drafts).filter(hasContent).length;
  return <section className="review-screen"><div className="review-top"><button className="text-button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Revenir à la visite</button><Saved busy={busy} error="" /></div><p className="eyebrow">Contrôle de fin de visite</p><h1>{readonly ? "Visite clôturée" : pending.length ? `Encore ${pending.length} zone${pending.length > 1 ? "s" : ""} à renseigner` : "Prêt à clôturer"}</h1><p className="review-intro">{visit.propertyName} · {readonly ? "lecture seule" : formatDate(visit.scheduledAt)}</p>
    {readonly && <div className="closed-card"><Check size={24} aria-hidden="true" /><strong>Enregistrée sur l’appareil</strong><p>{field.actions.filter((item) => item.visitId === visit.id).length} action(s) dans le suivi. Relisez le compte rendu puis téléchargez le PDF pour votre messagerie.</p><button className="primary-action export-main" disabled={busy} onClick={onExport}>Compte rendu et sauvegarde<Download size={18} aria-hidden="true" /></button><div className="button-pair"><button className="secondary-action" onClick={onActions}>Voir les actions</button><button className="secondary-action" disabled={busy} onClick={onReopen}>Rouvrir</button></div></div>}
    {!readonly && pending.map((zone) => <div className="blocking-card" key={zone.id}><strong>{zone.zoneLabel} sans statut</strong><p>Indiquez « Rien à signaler », ajoutez un constat ou marquez la zone non accessible.</p><button onClick={() => onZone(zone.order)}>Compléter {zone.zoneLabel}<ArrowRight size={18} aria-hidden="true" /></button></div>)}
    <div className="review-grid"><div><strong>{zones.length - pending.length}/{zones.length}</strong><span>zones</span></div><div><strong className="observed-text">{observations.length}</strong><span>constats</span></div><div><strong className="urgent-text">{observations.filter((item) => item.severity === "urgent").length}</strong><span>urgents</span></div><div><strong className="inaccessible-text">{zones.filter((item) => item.status === "inaccessible").length}</strong><span>inaccessibles</span></div></div>
    <div className="section-title"><h2>Constats</h2>{!readonly && <small>{actionCopy}</small>}</div><div className="capture-feed review-feed">{sorted.map((item) => <ObservationCard key={item.id} item={item} readonly={readonly} onAction={onAction} showZone />)}{!sorted.length && <p className="muted">Aucun constat ajouté.</p>}</div>
    <div className="section-title"><h2>Zones</h2><small>{zones.length - pending.length}/{zones.length} renseignées</small></div><ZoneList field={field} drafts={drafts} onZone={onZone} />
    {!readonly && unsent > 0 && <p className="draft-warning">{unsent} brouillon(s) ne figurent pas parmi les constats. Ajoutez-les avant de clôturer s’ils doivent être pris en compte ; sinon ils resteront conservés pour une réouverture.</p>}
    {!readonly && (confirmation === "close" ? <div className="confirmation"><h2>Clôturer la visite ?</h2><p>{actionCopy} La visite passera en lecture seule ; vous pourrez la rouvrir.</p><div className="button-pair"><button className="secondary-action" onClick={() => setConfirmation(null)}>Annuler</button><button className="primary-action" disabled={busy || recording || pending.length > 0} onClick={async () => { await onClose(); setConfirmation(null); }}>Oui, clôturer<Check size={18} aria-hidden="true" /></button></div></div> : <><button className="primary-action review-primary" disabled={pending.length > 0 || busy || recording} onClick={() => setConfirmation("close")}>Clôturer la visite<Check size={20} aria-hidden="true" /></button><p className={pending.length ? "inaccessible-text" : "muted"}>{pending.length ? `Renseignez ${pending.length === 1 ? pending[0].zoneLabel : `${pending.length} zones`} pour clôturer.` : "Après clôture, la visite passe en lecture seule."}</p></>)}
    {!readonly && <button className="secondary-action add-zone" disabled={busy || recording} onClick={onExport}>Sauvegarder la visite en cours<Download size={18} aria-hidden="true" /></button>}
    {visit.id === DEMO_VISIT_ID && (confirmation === "reset" ? <div className="confirmation"><h2>Réinitialiser la démonstration ?</h2><p>Les données de cette visite de démonstration seront effacées. Les autres visites seront conservées.</p><div className="button-pair"><button className="secondary-action" onClick={() => setConfirmation(null)}>Annuler</button><button className="primary-action" disabled={busy} onClick={onReset}>Effacer la démo</button></div></div> : <button className="danger-link" onClick={() => setConfirmation("reset")}>Réinitialiser la démonstration</button>)}
  </section>;
}

function ActionsScreen({ field, onSave }: { field: VistaFieldState; onSave: (action: FollowUpAction) => Promise<boolean> }) {
  const [filter, setFilter] = useState<"open" | "urgent" | "done">("open"); const [assign, setAssign] = useState<FollowUpAction | null>(null); const [submitting, setSubmitting] = useState(false);
  const groups = { open: field.actions.filter((item) => item.status === "open"), urgent: field.actions.filter((item) => item.status === "open" && item.severity === "urgent"), done: field.actions.filter((item) => item.status === "done") };
  const items = groups[filter]; const visitIds = [...new Set(items.map((item) => item.visitId))];
  return <section className="secondary-screen"><p className="eyebrow">Suivi technique</p><h1>Actions</h1><div className="action-filters" role="group" aria-label="Filtrer les actions">{(["open", "urgent", "done"] as const).map((key) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{({ open: "À faire", urgent: "Urgentes", done: "Faites" })[key]}<b>{groups[key].length}</b></button>)}</div>
    {!items.length && <div className="empty-list"><ListChecks size={30} aria-hidden="true" /><h2>{!field.actions.length ? "Aucune action en attente" : filter === "urgent" ? "Aucune action urgente." : filter === "done" ? "Aucune action terminée pour l’instant." : "Tout est fait."}</h2>{!field.actions.length && <p>Les actions sélectionnées dans vos constats apparaîtront ici après clôture de la visite.</p>}</div>}
    {visitIds.map((id) => <div className="action-group" key={id}><h2>{items.find((item) => item.visitId === id)?.propertyName}</h2><p>Visite technique {id === field.visit.id ? `du ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(field.visit.scheduledAt))}` : ""}</p>{items.filter((item) => item.visitId === id).map((item) => <article className="capture-card action-card" key={item.id}><div className="capture-meta"><b className={`severity sev-${item.severity}`}>{SEVERITY[item.severity]}</b><span>{item.zoneLabel}</span></div><p className={item.status === "done" ? "done-copy" : ""}>{item.text}</p><dl><div><dt>Intervenant</dt><dd>{item.assignee || "À désigner"}</dd></div><div><dt>Échéance</dt><dd>{item.dueDate ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${item.dueDate}T12:00:00`)) : "À fixer"}</dd></div></dl><div className="button-pair"><button className="secondary-action" onClick={() => setAssign(item)}>Assigner</button><button className="soft-action" disabled={submitting} onClick={async () => { setSubmitting(true); const now = new Date().toISOString(); await onSave({ ...item, status: item.status === "done" ? "open" : "done", doneAt: item.status === "done" ? undefined : now, updatedAt: now }); setSubmitting(false); }}>{item.status === "done" ? "Rouvrir" : "Marquer faite"}<Check size={18} aria-hidden="true" /></button></div></article>)}</div>)}
    {assign && <Sheet title="Assigner une action" onClose={() => setAssign(null)}><h2>Assigner une action</h2><p>{assign.zoneLabel} · {assign.propertyName}</p><form onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setSubmitting(true); if (await onSave({ ...assign, assignee: String(data.get("assignee") ?? "").trim() || undefined, dueDate: String(data.get("dueDate") ?? "") || undefined, updatedAt: new Date().toISOString() })) setAssign(null); setSubmitting(false); }}><label className="form-field">Intervenant<input name="assignee" defaultValue={assign.assignee} placeholder="Entreprise ou personne" /></label><label className="form-field">Échéance<input name="dueDate" type="date" defaultValue={assign.dueDate} /></label><button className="primary-action" disabled={submitting}>Enregistrer<Check size={20} aria-hidden="true" /></button></form></Sheet>}
  </section>;
}
