import { useEffect, useRef, useState } from "react";
import { Download, FileText, LoaderCircle, Share2 } from "lucide-react";
import type { VistaFieldState } from "./lib/vista-db";
import { exportFileName, generateVisitArchive, generateVisitPdf, reportBlockers } from "./lib/vista-export";

export default function VisitExport({ field }: { field: VistaFieldState }) {
  const [reviewed, setReviewed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ file: File; url: string; kind: "pdf" | "zip" } | null>(null);
  const activeUrl = useRef(""); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (activeUrl.current) URL.revokeObjectURL(activeUrl.current); }; }, []);
  const blockers = reportBlockers(field); const audio = field.observations.filter((item) => item.audio).length;
  const draftCount = field.drafts.filter((item) => item.text.trim() || item.audio || item.photos.length).length;
  async function prepare(kind: "pdf" | "zip") {
    setBusy(true); setError("");
    try {
      const blob = kind === "pdf" ? await generateVisitPdf(field) : await generateVisitArchive(field);
      if (!mounted.current) return;
      const file = new File([blob], exportFileName(field, kind), { type: blob.type });
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
      const url = URL.createObjectURL(file); activeUrl.current = url; setPrepared({ file, url, kind });
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Export impossible. Les données de la visite sont conservées ; réessayez."); }
    finally { if (mounted.current) setBusy(false); }
  }
  const shareable = prepared && typeof navigator.canShare === "function" && navigator.canShare({ files: [prepared.file] });
  return <section className="visit-export"><h2>Compte rendu et sauvegarde</h2><p className="muted">{field.visit.propertyName} · {field.zones.length} zones · {field.observations.length} constats</p>
    <article className="export-summary"><FileText size={24} aria-hidden="true" /><strong>PDF pour le conseil syndical</strong><p>Résumé, constats par zone, photos légendées et actions. Les codes et contacts privés de la copropriété sont exclus.</p></article>
    {audio > 0 && <p className="draft-warning">{audio} note(s) vocale(s). La transcription automatique n’est pas encore raccordée : écoutez chaque note et complétez le texte avant de valider le compte rendu. Les audios sont conservés dans la sauvegarde, pas dans le PDF.</p>}
    {draftCount > 0 && <p className="draft-warning">{draftCount} brouillon(s) non ajouté(s) seront exclus du PDF, mais inclus dans la sauvegarde.</p>}
    {blockers.length > 0 && <div className="export-blockers" role="status">{blockers.map((message) => <p key={message}>{message}</p>)}</div>}
    <label className="export-review"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />J’ai relu les constats, vérifié les photos et complété les textes des notes vocales. Les brouillons restants peuvent être exclus.</label>
    <button className="primary-action" disabled={busy || !reviewed || blockers.length > 0} onClick={() => prepare("pdf")}>Préparer le PDF{busy ? <LoaderCircle className="saving-spinner" size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}</button>
    <div className="export-backup"><h3>Sauvegarde complète de la visite</h3><p>Archive ZIP : récapitulatif lisible, données structurées, photos et notes vocales originales, brouillons compris. Conservez-la dans un emplacement privé. Les accès privés sont exclus ; la réimportation dans VISTA n’est pas encore disponible.</p><button className="secondary-action" disabled={busy} onClick={() => prepare("zip")}>Préparer la sauvegarde<Download size={20} aria-hidden="true" /></button></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {prepared && <div className="prepared-export" role="status"><strong>{prepared.kind === "pdf" ? "PDF prêt" : "Sauvegarde prête"}</strong><small>{prepared.file.name} · {(prepared.file.size / 1024 / 1024).toFixed(2)} Mo</small><a className="primary-action" href={prepared.url} download={prepared.file.name}>Télécharger {prepared.kind === "pdf" ? "le PDF" : "la sauvegarde"}<Download size={20} aria-hidden="true" /></a>{shareable && <button className="secondary-action" onClick={async () => { try { await navigator.share({ files: [prepared.file], title: `VISTA - ${field.visit.propertyName}` }); } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("Le partage n’est pas disponible. Téléchargez le fichier et joignez-le depuis votre messagerie."); } }}>Partager le fichier<Share2 size={20} aria-hidden="true" /></button>}<p>Ouvrez le fichier téléchargé pour vérifier son contenu, puis joignez-le à un mail depuis votre messagerie habituelle.</p></div>}
  </section>;
}
