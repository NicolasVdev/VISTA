"use client";

import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Ban, Camera, Check, ClipboardList, Download, House, Images, ListChecks, LoaderCircle, Mic, Plus, Square, X } from "lucide-react";
import {
  loadFieldState,
  resetFieldState,
  saveObservation,
  saveVisit,
  saveZoneProgress,
  type VistaMedia,
  type VistaObservation,
  type VistaVisit,
  type VistaZoneProgress,
  type ZoneStatus,
  type ZoneTemplate,
} from "./lib/vista-db";

type Screen = "home" | "visits" | "actions" | "visit" | "review";
type MediaView = VistaMedia & { previewUrl: string };
type ObservationView = Omit<VistaObservation, "audio" | "photos"> & {
  audio?: MediaView;
  photos: MediaView[];
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const ZONES: ZoneTemplate[] = [
  { id: "toiture", label: "Toiture", hint: "Étanchéité, évacuations, équipements" },
  { id: "etage-6", label: "6e étage", hint: "Palier, éclairage, portes, murs" },
  { id: "etage-5", label: "5e étage", hint: "Palier, éclairage, portes, murs" },
  { id: "etage-4", label: "4e étage", hint: "Palier, éclairage, portes, murs" },
  { id: "etage-3", label: "3e étage", hint: "Palier, éclairage, portes, murs" },
  { id: "etage-2", label: "2e étage", hint: "Palier, éclairage, portes, murs" },
  { id: "etage-1", label: "1er étage", hint: "Palier, éclairage, portes, murs" },
  { id: "rdc", label: "Rez-de-chaussée", hint: "Hall, boîtes aux lettres, accès" },
  { id: "sous-sol", label: "Sous-sol & parking", hint: "Sas, caves, parkings, électricité" },
];

const STATUS_LABELS: Record<ZoneStatus, string> = {
  pending: "À contrôler",
  clear: "Rien à signaler",
  observed: "Observation ajoutée",
  inaccessible: "Non accessible",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatVisitDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function mediaWithPreview(media: VistaMedia): MediaView {
  return { ...media, previewUrl: URL.createObjectURL(media.blob) };
}

function observationWithPreviews(observation: VistaObservation): ObservationView {
  return {
    ...observation,
    audio: observation.audio ? mediaWithPreview(observation.audio) : undefined,
    photos: observation.photos.map(mediaWithPreview),
  };
}

function storedMedia(media: MediaView): VistaMedia {
  return {
    id: media.id,
    blob: media.blob,
    mimeType: media.mimeType,
    fileName: media.fileName,
    createdAt: media.createdAt,
  };
}

function revokeObservationUrls(observations: ObservationView[]) {
  observations.forEach((observation) => {
    if (observation.audio) URL.revokeObjectURL(observation.audio.previewUrl);
    observation.photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  });
}

export default function VistaApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [visit, setVisit] = useState<VistaVisit | null>(null);
  const [zoneProgress, setZoneProgress] = useState<VistaZoneProgress[]>([]);
  const [observations, setObservations] = useState<ObservationView[]>([]);
  const [zoneIndex, setZoneIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [draftAudio, setDraftAudio] = useState<MediaView | null>(null);
  const [draftPhotos, setDraftPhotos] = useState<MediaView[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandalone());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  const currentZone = ZONES[zoneIndex];
  const currentZoneProgress = zoneProgress.find((zone) => zone.zoneId === currentZone.id);
  const currentZoneObservations = useMemo(
    () => observations.filter((observation) => observation.zoneId === currentZone.id),
    [observations, currentZone.id],
  );
  const completedZoneCount = zoneProgress.filter((zone) => zone.status !== "pending").length;
  const pendingSyncCount = observations.filter((observation) => observation.syncStatus === "local").length;
  const hasDraft = Boolean(draft.trim() || draftAudio || draftPhotos.length);
  const storageReady = Boolean(visit && zoneProgress.length === ZONES.length);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    loadFieldState(ZONES)
      .then((state) => {
        setVisit(state.visit);
        setZoneProgress(state.zones);
        setObservations(state.observations.map(observationWithPreviews));
        const savedIndex = ZONES.findIndex((zone) => zone.id === state.visit.currentZoneId);
        setZoneIndex(savedIndex >= 0 ? savedIndex : 0);
      })
      .catch(() => window.alert("Le stockage local de VISTA n’a pas pu être initialisé."));

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function updateVisit(values: Partial<VistaVisit>) {
    if (!visit) return;
    const nextVisit = { ...visit, ...values, updatedAt: new Date().toISOString() };
    setVisit(nextVisit);
    await saveVisit(nextVisit);
  }

  async function updateZoneStatus(status: ZoneStatus) {
    if (!currentZoneProgress) return;
    if (currentZoneObservations.length > 0 && status !== "observed") {
      window.alert("Cette zone contient déjà une observation. Son statut reste « Observation ajoutée ».");
      return;
    }
    const updated = { ...currentZoneProgress, status, updatedAt: new Date().toISOString() };
    setZoneProgress((zones) => zones.map((zone) => zone.id === updated.id ? updated : zone));
    await saveZoneProgress(updated);
  }

  async function startVisit() {
    if (!visit) return;
    if (visit.status === "completed") {
      setScreen("review");
      return;
    }
    if (visit.status === "planned") await updateVisit({ status: "in_progress" });
    setScreen("visit");
  }

  async function submitObservation() {
    if (!visit || !hasDraft || saving || recording) return;
    setSaving(true);
    const now = new Date().toISOString();
    const observation: VistaObservation = {
      id: crypto.randomUUID(),
      visitId: visit.id,
      zoneId: currentZone.id,
      zoneLabel: currentZone.label,
      createdAt: now,
      updatedAt: now,
      text: draft.trim() || undefined,
      audio: draftAudio ? storedMedia(draftAudio) : undefined,
      photos: draftPhotos.map(storedMedia),
      syncStatus: "local",
    };

    try {
      await saveObservation(observation);
      setObservations((items) => [...items, {
        ...observation,
        audio: draftAudio ?? undefined,
        photos: draftPhotos,
      }]);
      setDraft("");
      setDraftAudio(null);
      setDraftPhotos([]);
      await updateZoneStatus("observed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorderStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const createdAt = new Date().toISOString();
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setRecordingSeconds(0);
        setDraftAudio((previous) => {
          if (previous) URL.revokeObjectURL(previous.previewUrl);
          return {
            id: crypto.randomUUID(),
            blob,
            mimeType,
            fileName: `note-${Date.now()}.webm`,
            createdAt,
            previewUrl: URL.createObjectURL(blob),
          };
        });
      };
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
    } catch {
      window.alert("VISTA a besoin de l’autorisation du microphone pour enregistrer une note vocale.");
    }
  }

  function importPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    const imported = files.map((file): MediaView => ({
      id: crypto.randomUUID(),
      blob: file,
      mimeType: file.type,
      fileName: file.name,
      createdAt: new Date().toISOString(),
      previewUrl: URL.createObjectURL(file),
    }));
    setDraftPhotos((photos) => [...photos, ...imported]);
  }

  function removeDraftAudio() {
    if (draftAudio) URL.revokeObjectURL(draftAudio.previewUrl);
    setDraftAudio(null);
  }

  function removeDraftPhoto(id: string) {
    setDraftPhotos((photos) => {
      const removed = photos.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return photos.filter((photo) => photo.id !== id);
    });
  }

  function canLeaveZone() {
    if (recording || hasDraft) {
      window.alert("Enregistrez l’observation en cours avant de changer de zone.");
      return false;
    }
    return true;
  }

  async function moveToZone(nextIndex: number) {
    if (!visit || !canLeaveZone()) return;
    const bounded = Math.max(0, Math.min(nextIndex, ZONES.length - 1));
    setZoneIndex(bounded);
    await updateVisit({ currentZoneId: ZONES[bounded].id, status: "in_progress" });
  }

  async function advanceZone() {
    if (!currentZoneProgress || !canLeaveZone()) return;
    if (currentZoneProgress.status === "pending") {
      window.alert("Indiquez « Rien à signaler », ajoutez une observation ou marquez la zone non accessible.");
      return;
    }
    if (zoneIndex === ZONES.length - 1) {
      setScreen("review");
      return;
    }
    await moveToZone(zoneIndex + 1);
  }

  async function openZoneFromReview(index: number) {
    setScreen("visit");
    await moveToZone(index);
  }

  async function closeVisit() {
    if (!visit) return;
    const missing = zoneProgress.filter((zone) => zone.status === "pending");
    if (missing.length > 0) {
      window.alert(`${missing.length} zone${missing.length > 1 ? "s restent" : " reste"} à contrôler.`);
      return;
    }
    const now = new Date().toISOString();
    await updateVisit({ status: "completed", completedAt: now });
  }

  async function installVista() {
    if (installPrompt) {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }
    setShowInstallHelp(true);
  }

  async function resetDemo() {
    if (!window.confirm("Effacer cette visite locale et toutes ses observations ?")) return;
    revokeObservationUrls(observations);
    if (draftAudio) URL.revokeObjectURL(draftAudio.previewUrl);
    draftPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    const state = await resetFieldState(ZONES);
    setVisit(state.visit);
    setZoneProgress(state.zones);
    setObservations([]);
    setDraft("");
    setDraftAudio(null);
    setDraftPhotos([]);
    setZoneIndex(0);
    setScreen("home");
  }

  return (
    <main className={`vista-shell ${screen === "visit" ? "visit-mode" : ""}`}>
      {!online && <div className="offline-banner">Mode hors connexion · vos données restent sur cet appareil</div>}

      {screen === "visit" ? (
        <VisitScreen
          online={online}
          observations={currentZoneObservations}
          currentZone={currentZone}
          zoneStatus={currentZoneProgress?.status ?? "pending"}
          draft={draft}
          draftAudio={draftAudio}
          draftPhotos={draftPhotos}
          onDraftChange={setDraft}
          onSave={submitObservation}
          onToggleRecording={toggleRecording}
          onRemoveAudio={removeDraftAudio}
          onRemovePhoto={removeDraftPhoto}
          onStatusChange={updateZoneStatus}
          recording={recording}
          recordingSeconds={recordingSeconds}
          saving={saving}
          zoneIndex={zoneIndex}
          completedZoneCount={completedZoneCount}
          onBack={() => canLeaveZone() && setScreen("home")}
          onPrevious={() => moveToZone(zoneIndex - 1)}
          onNext={advanceZone}
          onCamera={() => cameraRef.current?.click()}
          onLibrary={() => libraryRef.current?.click()}
        />
      ) : screen === "review" && visit ? (
        <ReviewScreen
          visit={visit}
          zones={zoneProgress}
          observations={observations}
          onBack={() => setScreen("visit")}
          onOpenZone={openZoneFromReview}
          onCloseVisit={closeVisit}
          onReset={resetDemo}
        />
      ) : (
        <>
          <AppHeader online={online} />
          {screen === "home" && (
            <HomeScreen
              installed={installed}
              storageReady={storageReady}
              visit={visit}
              observationCount={observations.length}
              completedZoneCount={completedZoneCount}
              pendingSyncCount={pendingSyncCount}
              onInstall={installVista}
              onStart={startVisit}
            />
          )}
          {screen === "visits" && visit && (
            <VisitsScreen visit={visit} observationCount={observations.length} onResume={startVisit} />
          )}
          {screen === "actions" && <ActionsScreen />}
          <BottomNav screen={screen} onChange={setScreen} />
        </>
      )}

      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={importPhotos} />
      <input ref={libraryRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={importPhotos} />

      {showInstallHelp && <InstallSheet ios={isIosDevice()} onClose={() => setShowInstallHelp(false)} />}
    </main>
  );
}

function AppHeader({ online }: { online: boolean }) {
  return (
    <header className="vista-header">
      <div className="vista-brand"><span className="vista-mark">V</span><span>VISTA</span></div>
      <span className={`status-pill ${online ? "" : "is-offline"}`}><i /> {online ? "En ligne" : "Hors ligne"}</span>
    </header>
  );
}

function HomeScreen({
  installed,
  storageReady,
  visit,
  observationCount,
  completedZoneCount,
  pendingSyncCount,
  onInstall,
  onStart,
}: {
  installed: boolean;
  storageReady: boolean;
  visit: VistaVisit | null;
  observationCount: number;
  completedZoneCount: number;
  pendingSyncCount: number;
  onInstall: () => void;
  onStart: () => void;
}) {
  const progress = Math.round((completedZoneCount / ZONES.length) * 100);
  const buttonLabel = visit?.status === "completed"
    ? "Consulter la visite"
    : visit?.status === "in_progress" ? "Reprendre la visite" : "Commencer la visite";

  return (
    <>
      <section className="welcome-block">
        <p className="eyebrow">{visit ? formatVisitDate(visit.scheduledAt) : "Chargement"}</p>
        <h1>Bonjour Nicolas</h1>
        <p>{visit?.status === "completed" ? "Votre visite est clôturée." : "Votre prochaine visite est prête."}</p>
      </section>

      {!installed && (
        <button type="button" className="install-card" onClick={onInstall}>
          <span className="install-icon"><Download size={21} aria-hidden="true" /></span>
          <span><strong>Installer VISTA</strong><small>Ajoutez l’icône sur votre écran d’accueil</small></span>
          <b>Installer</b>
        </button>
      )}

      <section className="visit-card">
        <div className="visit-card-topline">
          <span className="visit-tag">À 09:30</span>
          <span className="visit-type">{visit?.status === "completed" ? "Visite clôturée" : "Visite technique"}</span>
        </div>
        <h2>{visit?.propertyName ?? "Résidence du Parc"}</h2>
        <p>{visit?.address ?? "12 rue des Tilleuls · 75015 Paris"}</p>
        <div className="visit-progress-line"><span style={{ width: `${progress}%` }} /></div>
        <div className="visit-stats">
          <span><strong>{completedZoneCount}/{ZONES.length}</strong> zones</span>
          <span><strong>{observationCount}</strong> observation{observationCount > 1 ? "s" : ""}</span>
          {pendingSyncCount > 0 && <span className="pending-copy">Stockage local</span>}
        </div>
        <button type="button" className="primary-action" onClick={onStart} disabled={!storageReady}>
          {buttonLabel}<span>→</span>
        </button>
      </section>

      <section className="today-section">
        <div><p className="eyebrow">Aujourd’hui</p><h2>Une visite planifiée</h2></div>
        <span className="day-count">1</span>
      </section>
    </>
  );
}

function VisitScreen({
  online,
  observations,
  currentZone,
  zoneStatus,
  draft,
  draftAudio,
  draftPhotos,
  onDraftChange,
  onSave,
  onToggleRecording,
  onRemoveAudio,
  onRemovePhoto,
  onStatusChange,
  recording,
  recordingSeconds,
  saving,
  zoneIndex,
  completedZoneCount,
  onBack,
  onPrevious,
  onNext,
  onCamera,
  onLibrary,
}: {
  online: boolean;
  observations: ObservationView[];
  currentZone: ZoneTemplate;
  zoneStatus: ZoneStatus;
  draft: string;
  draftAudio: MediaView | null;
  draftPhotos: MediaView[];
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onToggleRecording: () => void;
  onRemoveAudio: () => void;
  onRemovePhoto: (id: string) => void;
  onStatusChange: (status: ZoneStatus) => void;
  recording: boolean;
  recordingSeconds: number;
  saving: boolean;
  zoneIndex: number;
  completedZoneCount: number;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const percent = Math.round((completedZoneCount / ZONES.length) * 100);
  const canSave = Boolean(draft.trim() || draftAudio || draftPhotos.length);
  const hasMedia = Boolean(draftAudio || draftPhotos.length);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = useRef<HTMLElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const height = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? "auto" : "hidden";
  }, [draft, hasMedia]);

  useEffect(() => {
    // Le clavier réduit le viewport visible, même si le viewport CSS ne change pas.
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (viewport && viewport.scale !== 1) return;
      fieldRef.current?.style.setProperty("--field-height", `${viewport?.height ?? window.innerHeight}px`);
      fieldRef.current?.style.setProperty("--field-top", `${viewport?.offsetTop ?? 0}px`);
      setKeyboardOpen(Boolean(viewport && window.innerHeight - viewport.height > 140));
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!attachmentMenuRef.current?.contains(event.target as Node)) setAttachmentMenuOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAttachmentMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [attachmentMenuOpen]);

  return (
    <section ref={fieldRef} className={`field-screen ${keyboardOpen ? "keyboard-open" : ""}`}>
      <div className="field-content">
      <header className="field-header">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Retour"><ArrowLeft size={22} aria-hidden="true" /></button>
        <div><span>Résidence du Parc{!online ? " · Hors connexion" : ""}</span><strong>Zone {zoneIndex + 1} sur {ZONES.length}</strong></div>
        <span className="progress-number">{percent}%</span>
      </header>

      <div className="field-progress"><span style={{ width: `${percent}%` }} /></div>

      <div className="zone-heading">
        <p className="eyebrow">Inspection en cours</p>
        <h1>{currentZone.label}</h1>
        <p>{currentZone.hint}</p>
      </div>

      <ZoneStatusPicker status={zoneStatus} hasObservations={observations.length > 0} onChange={onStatusChange} />

      <div className="capture-feed">
        {observations.length === 0 ? (
          <div className="empty-capture">
            <span><Mic size={24} aria-hidden="true" /></span>
            <strong>Dictez votre premier constat</strong>
            <p>Appuyez sur le micro pour parler, ou écrivez ci-dessous. Le bouton + permet d’ajouter des photos.</p>
          </div>
        ) : observations.map((observation) => <ObservationCard key={observation.id} observation={observation} />)}
      </div>
      </div>

      <div className="composer-wrap">
        {recording && <div className="recording-bar" role="status"><i /> Enregistrement {durationLabel(recordingSeconds)} <span>Appuyez sur ■ pour terminer</span></div>}
        {(draftAudio || draftPhotos.length > 0) && (
          <DraftAttachments audio={draftAudio} photos={draftPhotos} onRemoveAudio={onRemoveAudio} onRemovePhoto={onRemovePhoto} />
        )}
        {hasMedia && <p id="composer-media-help" className="composer-context">{draftAudio ? "Note vocale" : "Photos"}{draftAudio && draftPhotos.length > 0 ? " + photos" : ""} · ajoutez un titre ou commentaire ci-dessous (facultatif).</p>}
        <div className={`composer ${canSave ? "has-draft" : ""}`}>
          <div className="attachment-control" ref={attachmentMenuRef}>
            {attachmentMenuOpen && (
              <div id="attachment-options" className="attachment-menu" role="group" aria-label="Ajouter des photos">
                <button type="button" onClick={() => { setAttachmentMenuOpen(false); onCamera(); }}><Camera size={22} aria-hidden="true" /><span>Prendre une photo</span></button>
                <button type="button" onClick={() => { setAttachmentMenuOpen(false); onLibrary(); }}><Images size={22} aria-hidden="true" /><span>Importer des photos</span></button>
              </div>
            )}
            <button type="button" className="composer-tool" onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)} aria-label={attachmentMenuOpen ? "Fermer les options de photos" : "Ajouter des photos"} aria-expanded={attachmentMenuOpen} aria-controls="attachment-options" disabled={recording || saving}>
              {attachmentMenuOpen ? <X size={23} aria-hidden="true" /> : <Plus size={25} aria-hidden="true" />}
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onFocus={() => setAttachmentMenuOpen(false)}
            placeholder={hasMedia ? "Titre / commentaire…" : "Écrire…"}
            rows={1}
            aria-label={hasMedia ? "Titre ou commentaire des pièces jointes" : "Observation écrite"}
            aria-describedby={hasMedia ? "composer-media-help" : undefined}
          />
          <button type="button" className={`mic-button ${recording ? "recording" : ""}`} onClick={onToggleRecording} disabled={saving || Boolean(draftAudio)} aria-label={recording ? "Arrêter l’enregistrement" : "Ajouter une note vocale"}>
            {recording ? <Square size={20} fill="currentColor" aria-hidden="true" /> : <Mic size={23} aria-hidden="true" />}
          </button>
          {canSave && <button type="button" className="send-button" onClick={() => { setAttachmentMenuOpen(false); onSave(); }} disabled={saving || recording} aria-label="Enregistrer l’observation">
            {saving ? <LoaderCircle size={23} className="saving-spinner" aria-hidden="true" /> : <ArrowRight size={25} aria-hidden="true" />}
          </button>}
        </div>
        <div className="zone-navigation">
          <button type="button" onClick={onPrevious} disabled={zoneIndex === 0}><ArrowLeft size={17} aria-hidden="true" /> Zone précédente</button>
          <button type="button" className="next-zone" onClick={onNext}>{zoneIndex === ZONES.length - 1 ? "Vérifier la visite" : "Zone suivante"}<ArrowRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  );
}

function ZoneStatusPicker({ status, hasObservations, onChange }: { status: ZoneStatus; hasObservations: boolean; onChange: (status: ZoneStatus) => void }) {
  return (
    <section className="zone-status-card">
      <div><span>Statut de la zone</span><strong className={`zone-status status-${status}`}>{STATUS_LABELS[status]}</strong></div>
      <div className="zone-status-actions">
        <button type="button" className={status === "clear" ? "active" : ""} disabled={hasObservations} onClick={() => onChange("clear")}><Check size={17} aria-hidden="true" /> Rien à signaler</button>
        <button type="button" className={status === "inaccessible" ? "active" : ""} disabled={hasObservations} onClick={() => onChange("inaccessible")}><Ban size={17} aria-hidden="true" /> Non accessible</button>
      </div>
    </section>
  );
}

function DraftAttachments({ audio, photos, onRemoveAudio, onRemovePhoto }: { audio: MediaView | null; photos: MediaView[]; onRemoveAudio: () => void; onRemovePhoto: (id: string) => void }) {
  return (
    <div className="draft-attachments">
      {audio && (
        <div className="draft-audio">
          <span><Mic size={18} aria-hidden="true" /> Note vocale jointe</span>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audio.previewUrl} controls preload="metadata" aria-label="Écouter la note vocale avant enregistrement" />
          <button type="button" onClick={onRemoveAudio} aria-label="Retirer la note vocale"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      {photos.length > 0 && (
        <div className="draft-photos">
          {photos.map((photo) => (
            <div key={photo.id}>
              <img src={photo.previewUrl} alt="Pièce jointe à l’observation" />
              <button type="button" onClick={() => onRemovePhoto(photo.id)} aria-label="Retirer la photo"><X size={16} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ObservationCard({ observation }: { observation: ObservationView }) {
  const parts = [observation.text ? (observation.audio || observation.photos.length ? "Commentaire" : "Texte") : "", observation.audio ? "Voix" : "", observation.photos.length ? `${observation.photos.length} photo${observation.photos.length > 1 ? "s" : ""}` : ""].filter(Boolean);
  return (
    <article className="capture-card observation-card">
      <div className="capture-meta"><span>{parts.join(" · ")}</span><time>{formatTime(observation.createdAt)}</time></div>
      {observation.text && <p>{observation.text}</p>}
      {observation.audio && (
        // La transcription sera ajoutée après la synchronisation backend.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={observation.audio.previewUrl} controls preload="metadata" />
      )}
      {observation.photos.length > 0 && (
        <div className="observation-photos">
          {observation.photos.map((photo) => <img key={photo.id} src={photo.previewUrl} alt={`Observation — ${observation.zoneLabel}`} />)}
        </div>
      )}
      <span className="local-state">{observation.syncStatus === "local" ? "Conservé sur l’appareil" : "Synchronisé"}</span>
    </article>
  );
}

function ReviewScreen({ visit, zones, observations, onBack, onOpenZone, onCloseVisit, onReset }: { visit: VistaVisit; zones: VistaZoneProgress[]; observations: ObservationView[]; onBack: () => void; onOpenZone: (index: number) => void; onCloseVisit: () => void; onReset: () => void }) {
  const missingZones = zones.filter((zone) => zone.status === "pending");
  const audioCount = observations.filter((item) => item.audio).length;
  const photoCount = observations.reduce((total, item) => total + item.photos.length, 0);
  const completed = visit.status === "completed";

  return (
    <section className="review-screen">
      <button type="button" className="text-button" onClick={onBack}>← Revenir à la visite</button>
      <p className="eyebrow">Contrôle de fin de visite</p>
      <h1>{completed ? "Visite clôturée" : missingZones.length ? "Quelques zones restent à vérifier" : "Tout est prêt"}</h1>
      <p className="review-intro">
        {completed
          ? "La visite est enregistrée localement et prête pour la future synchronisation du compte rendu."
          : missingZones.length
            ? "VISTA bloque la clôture tant qu’une zone n’est pas contrôlée ou justifiée."
            : "Toutes les zones sont renseignées. Vous pouvez clôturer la visite sans perdre les données locales."}
      </p>
      <div className="review-grid">
        <div><strong>{zones.length - missingZones.length}/{zones.length}</strong><span>zones renseignées</span></div>
        <div><strong>{observations.length}</strong><span>observations</span></div>
        <div><strong>{audioCount}</strong><span>notes vocales</span></div>
        <div><strong>{photoCount}</strong><span>photos</span></div>
      </div>

      <div className="zone-review-list">
        {zones.map((zone) => (
          <button type="button" key={zone.id} onClick={() => onOpenZone(zone.order)}>
            <span className={`zone-dot status-${zone.status}`} />
            <span><strong>{zone.zoneLabel}</strong><small>{STATUS_LABELS[zone.status]}</small></span>
            <b>→</b>
          </button>
        ))}
      </div>

      {!completed ? (
        <button type="button" className="primary-action review-primary" onClick={onCloseVisit} disabled={missingZones.length > 0}>
          Clôturer la visite <span>✓</span>
        </button>
      ) : (
        <button type="button" className="primary-action review-primary" onClick={() => window.alert("La synchronisation, l’IA et le PDF constituent le prochain lot de développement.")}>
          Préparer le compte rendu <span>→</span>
        </button>
      )}
      <button type="button" className="danger-link" onClick={onReset}>Réinitialiser cette démonstration</button>
    </section>
  );
}

function VisitsScreen({ visit, observationCount, onResume }: { visit: VistaVisit; observationCount: number; onResume: () => void }) {
  return (
    <section className="secondary-screen">
      <p className="eyebrow">Planning</p>
      <h1>Mes visites</h1>
      <button type="button" className="list-card" onClick={onResume}>
        <span className="date-tile"><strong>30</strong>SEP</span>
        <span><strong>{visit.propertyName}</strong><small>09:30 · {observationCount} observation{observationCount > 1 ? "s" : ""} · {visit.status === "completed" ? "Clôturée" : "En cours"}</small></span>
        <b>→</b>
      </button>
    </section>
  );
}

function ActionsScreen() {
  return (
    <section className="secondary-screen">
      <p className="eyebrow">Suivi technique</p>
      <h1>Actions</h1>
      <div className="empty-list"><span>✓</span><strong>Aucune action en attente</strong><p>Les tâches validées après une visite apparaîtront ici.</p></div>
    </section>
  );
}

function BottomNav({ screen, onChange }: { screen: Screen; onChange: (screen: Screen) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      <button className={screen === "home" ? "active" : ""} type="button" onClick={() => onChange("home")}><House size={21} aria-hidden="true" />Accueil</button>
      <button className={screen === "visits" ? "active" : ""} type="button" onClick={() => onChange("visits")}><ClipboardList size={21} aria-hidden="true" />Visites</button>
      <button className={screen === "actions" ? "active" : ""} type="button" onClick={() => onChange("actions")}><ListChecks size={21} aria-hidden="true" />Actions</button>
    </nav>
  );
}

function InstallSheet({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <section className="install-sheet">
        <span className="sheet-handle" />
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Fermer">×</button>
        <div className="large-mark">V</div>
        <h2 id="install-title">Installer VISTA</h2>
        <p>Une seule installation, puis VISTA se lancera depuis son icône comme une application.</p>
        {ios ? (
          <ol>
            <li><b>1</b><span>Appuyez sur <strong>Partager</strong> dans Safari</span></li>
            <li><b>2</b><span>Choisissez <strong>Sur l’écran d’accueil</strong></span></li>
            <li><b>3</b><span>Confirmez avec <strong>Ajouter</strong></span></li>
          </ol>
        ) : (
          <p className="browser-help">Ouvrez le menu de votre navigateur puis choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</p>
        )}
        <button type="button" className="primary-action" onClick={onClose}>J’ai compris <span>✓</span></button>
      </section>
    </div>
  );
}
