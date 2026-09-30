"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  clearCaptures,
  listCaptures,
  saveCapture,
  type VistaCapture,
} from "./lib/vista-db";

type Screen = "home" | "visits" | "actions" | "visit" | "review";
type CaptureView = VistaCapture & { previewUrl?: string };

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const ZONES = [
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

const VISIT_KEY = "vista-active-zone";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
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

function withPreviewUrl(capture: VistaCapture): CaptureView {
  return capture.blob ? { ...capture, previewUrl: URL.createObjectURL(capture.blob) } : capture;
}

export default function VistaApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [captures, setCaptures] = useState<CaptureView[]>([]);
  const [zoneIndex, setZoneIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandalone());
  const [storageReady, setStorageReady] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  const currentZone = ZONES[zoneIndex];
  const currentZoneCaptures = useMemo(
    () => captures.filter((capture) => capture.zoneId === currentZone.id),
    [captures, currentZone.id],
  );
  const pendingCount = captures.filter((capture) => capture.syncStatus === "local").length;

  useEffect(() => {
    const savedZone = Number(localStorage.getItem(VISIT_KEY) ?? "0");
    if (Number.isInteger(savedZone) && savedZone >= 0 && savedZone < ZONES.length) {
      queueMicrotask(() => setZoneIndex(savedZone));
    }

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

    listCaptures()
      .then((savedCaptures) => {
        setCaptures(savedCaptures.map(withPreviewUrl));
        setStorageReady(true);
      })
      .catch(() => setStorageReady(true));

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

  async function addCapture(capture: VistaCapture) {
    await saveCapture(capture);
    setCaptures((items) => [...items, withPreviewUrl(capture)]);
  }

  async function submitText() {
    const text = draft.trim();
    if (!text) return;
    await addCapture({
      id: crypto.randomUUID(),
      kind: "text",
      zoneId: currentZone.id,
      zoneLabel: currentZone.label,
      createdAt: new Date().toISOString(),
      text,
      syncStatus: "local",
    });
    setDraft("");
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
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setRecordingSeconds(0);
        await addCapture({
          id: crypto.randomUUID(),
          kind: "audio",
          zoneId: currentZone.id,
          zoneLabel: currentZone.label,
          createdAt: new Date().toISOString(),
          blob,
          mimeType,
          fileName: `note-${Date.now()}.webm`,
          syncStatus: "local",
        });
      };
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
    } catch {
      window.alert("VISTA a besoin de l’autorisation du microphone pour enregistrer une note vocale.");
    }
  }

  async function importPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await addCapture({
      id: crypto.randomUUID(),
      kind: "photo",
      zoneId: currentZone.id,
      zoneLabel: currentZone.label,
      createdAt: new Date().toISOString(),
      blob: file,
      mimeType: file.type,
      fileName: file.name,
      syncStatus: "local",
    });
  }

  function moveToZone(nextIndex: number) {
    const bounded = Math.max(0, Math.min(nextIndex, ZONES.length - 1));
    setZoneIndex(bounded);
    localStorage.setItem(VISIT_KEY, String(bounded));
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
    if (!window.confirm("Effacer les observations locales de cette visite ?")) return;
    captures.forEach((capture) => capture.previewUrl && URL.revokeObjectURL(capture.previewUrl));
    await clearCaptures();
    setCaptures([]);
    moveToZone(0);
    setScreen("home");
  }

  return (
    <main className={`vista-shell ${screen === "visit" ? "visit-mode" : ""}`}>
      {!online && <div className="offline-banner">Mode hors connexion · vos données restent sur cet appareil</div>}

      {screen === "visit" ? (
        <VisitScreen
          captures={currentZoneCaptures}
          currentZone={currentZone}
          draft={draft}
          onDraftChange={setDraft}
          onSubmitText={submitText}
          onToggleRecording={toggleRecording}
          recording={recording}
          recordingSeconds={recordingSeconds}
          zoneIndex={zoneIndex}
          onBack={() => setScreen("home")}
          onPrevious={() => moveToZone(zoneIndex - 1)}
          onNext={() => zoneIndex === ZONES.length - 1 ? setScreen("review") : moveToZone(zoneIndex + 1)}
          onCamera={() => cameraRef.current?.click()}
          onLibrary={() => libraryRef.current?.click()}
        />
      ) : screen === "review" ? (
        <ReviewScreen captures={captures} onBack={() => setScreen("visit")} onReset={resetDemo} />
      ) : (
        <>
          <AppHeader online={online} />
          {screen === "home" && (
            <HomeScreen
              installed={installed}
              storageReady={storageReady}
              captures={captures}
              zoneIndex={zoneIndex}
              pendingCount={pendingCount}
              onInstall={installVista}
              onStart={() => setScreen("visit")}
            />
          )}
          {screen === "visits" && <VisitsScreen captures={captures} onResume={() => setScreen("visit")} />}
          {screen === "actions" && <ActionsScreen />}
          <BottomNav screen={screen} onChange={setScreen} />
        </>
      )}

      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={importPhoto} />
      <input ref={libraryRef} className="visually-hidden" type="file" accept="image/*" onChange={importPhoto} />

      {showInstallHelp && (
        <InstallSheet ios={isIosDevice()} onClose={() => setShowInstallHelp(false)} />
      )}
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
  captures,
  zoneIndex,
  pendingCount,
  onInstall,
  onStart,
}: {
  installed: boolean;
  storageReady: boolean;
  captures: CaptureView[];
  zoneIndex: number;
  pendingCount: number;
  onInstall: () => void;
  onStart: () => void;
}) {
  const hasStarted = captures.length > 0 || zoneIndex > 0;
  return (
    <>
      <section className="welcome-block">
        <p className="eyebrow">Mardi 30 septembre</p>
        <h1>Bonjour Nicolas</h1>
        <p>Votre prochaine visite est prête.</p>
      </section>

      {!installed && (
        <button type="button" className="install-card" onClick={onInstall}>
          <span className="install-icon">↓</span>
          <span><strong>Installer VISTA</strong><small>Ajoutez l’icône sur votre écran d’accueil</small></span>
          <b>Installer</b>
        </button>
      )}

      <section className="visit-card">
        <div className="visit-card-topline">
          <span className="visit-tag">À 09:30</span>
          <span className="visit-type">Visite technique</span>
        </div>
        <h2>Résidence du Parc</h2>
        <p>12 rue des Tilleuls · 75015 Paris</p>
        <div className="visit-progress-line"><span style={{ width: `${Math.round((zoneIndex / ZONES.length) * 100)}%` }} /></div>
        <div className="visit-stats">
          <span><strong>{ZONES.length}</strong> zones</span>
          <span><strong>{captures.length}</strong> observation{captures.length > 1 ? "s" : ""}</span>
          {pendingCount > 0 && <span className="pending-copy">{pendingCount} locale{pendingCount > 1 ? "s" : ""}</span>}
        </div>
        <button type="button" className="primary-action" onClick={onStart} disabled={!storageReady}>
          {hasStarted ? "Reprendre la visite" : "Commencer la visite"}<span>→</span>
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
  captures,
  currentZone,
  draft,
  onDraftChange,
  onSubmitText,
  onToggleRecording,
  recording,
  recordingSeconds,
  zoneIndex,
  onBack,
  onPrevious,
  onNext,
  onCamera,
  onLibrary,
}: {
  captures: CaptureView[];
  currentZone: (typeof ZONES)[number];
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmitText: () => void;
  onToggleRecording: () => void;
  recording: boolean;
  recordingSeconds: number;
  zoneIndex: number;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const percent = Math.round(((zoneIndex + 1) / ZONES.length) * 100);
  return (
    <section className="field-screen">
      <header className="field-header">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Retour">←</button>
        <div><span>Résidence du Parc</span><strong>Zone {zoneIndex + 1} sur {ZONES.length}</strong></div>
        <span className="progress-number">{percent}%</span>
      </header>

      <div className="field-progress"><span style={{ width: `${percent}%` }} /></div>

      <div className="zone-heading">
        <p className="eyebrow">Inspection en cours</p>
        <h1>{currentZone.label}</h1>
        <p>{currentZone.hint}</p>
      </div>

      <div className="capture-feed">
        {captures.length === 0 ? (
          <div className="empty-capture">
            <span>＋</span>
            <strong>Ajoutez ce que vous observez</strong>
            <p>Écrivez, dictez ou prenez une photo. Chaque élément restera lié à cette zone.</p>
          </div>
        ) : captures.map((capture) => <CaptureCard key={capture.id} capture={capture} />)}
      </div>

      <div className="composer-wrap">
        {recording && <div className="recording-bar"><i /> Enregistrement {durationLabel(recordingSeconds)} <span>Appuyez pour terminer</span></div>}
        <div className="composer">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Écrire une observation…"
            rows={1}
            aria-label="Observation écrite"
          />
          <button type="button" className="composer-tool" onClick={onCamera} aria-label="Prendre une photo">⌾</button>
          <button type="button" className="composer-tool" onClick={onLibrary} aria-label="Choisir une photo">▧</button>
          {draft.trim() ? (
            <button type="button" className="send-button" onClick={onSubmitText} aria-label="Ajouter l’observation">↑</button>
          ) : (
            <button type="button" className={`mic-button ${recording ? "recording" : ""}`} onClick={onToggleRecording} aria-label={recording ? "Arrêter l’enregistrement" : "Enregistrer une note vocale"}>●</button>
          )}
        </div>
        <div className="zone-navigation">
          <button type="button" onClick={onPrevious} disabled={zoneIndex === 0}>← Zone précédente</button>
          <button type="button" className="next-zone" onClick={onNext}>{zoneIndex === ZONES.length - 1 ? "Terminer la visite" : "Valider et continuer"} →</button>
        </div>
      </div>
    </section>
  );
}

function CaptureCard({ capture }: { capture: CaptureView }) {
  return (
    <article className={`capture-card capture-${capture.kind}`}>
      <div className="capture-meta"><span>{capture.kind === "text" ? "Note" : capture.kind === "audio" ? "Note vocale" : "Photo"}</span><time>{formatTime(capture.createdAt)}</time></div>
      {capture.kind === "text" && <p>{capture.text}</p>}
      {capture.kind === "audio" && capture.previewUrl && (
        // Les notes vocales seront transcrites lors de la connexion du moteur IA.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={capture.previewUrl} controls preload="metadata" />
      )}
      {capture.kind === "photo" && capture.previewUrl && (
        // Les URL Blob locales ne peuvent pas passer par l’optimiseur d’images serveur.
        <img src={capture.previewUrl} alt={`Observation — ${capture.zoneLabel}`} />
      )}
      <span className="local-state">{capture.syncStatus === "local" ? "Conservé sur l’appareil" : "Synchronisé"}</span>
    </article>
  );
}

function ReviewScreen({ captures, onBack, onReset }: { captures: CaptureView[]; onBack: () => void; onReset: () => void }) {
  const textCount = captures.filter((item) => item.kind === "text").length;
  const audioCount = captures.filter((item) => item.kind === "audio").length;
  const photoCount = captures.filter((item) => item.kind === "photo").length;
  return (
    <section className="review-screen">
      <button type="button" className="text-button" onClick={onBack}>← Revenir à la visite</button>
      <p className="eyebrow">Visite terminée</p>
      <h1>Prêt pour le compte rendu</h1>
      <p className="review-intro">Toutes les observations sont enregistrées localement. Elles pourront être synchronisées et structurées par l’IA dès que le backend sera connecté.</p>
      <div className="review-grid">
        <div><strong>{textCount}</strong><span>notes écrites</span></div>
        <div><strong>{audioCount}</strong><span>notes vocales</span></div>
        <div><strong>{photoCount}</strong><span>photos</span></div>
      </div>
      <button type="button" className="primary-action" onClick={() => window.alert("La génération IA et le PDF constituent la prochaine étape de développement.")}>Préparer le compte rendu <span>→</span></button>
      <button type="button" className="danger-link" onClick={onReset}>Réinitialiser cette démonstration</button>
    </section>
  );
}

function VisitsScreen({ captures, onResume }: { captures: CaptureView[]; onResume: () => void }) {
  return (
    <section className="secondary-screen">
      <p className="eyebrow">Planning</p>
      <h1>Mes visites</h1>
      <button type="button" className="list-card" onClick={onResume}>
        <span className="date-tile"><strong>30</strong>SEP</span>
        <span><strong>Résidence du Parc</strong><small>09:30 · {captures.length} observation{captures.length > 1 ? "s" : ""}</small></span>
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
      <button className={screen === "home" ? "active" : ""} type="button" onClick={() => onChange("home")}><span>⌂</span>Accueil</button>
      <button className={screen === "visits" ? "active" : ""} type="button" onClick={() => onChange("visits")}><span>▣</span>Visites</button>
      <button className={screen === "actions" ? "active" : ""} type="button" onClick={() => onChange("actions")}><span>✓</span>Actions</button>
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
