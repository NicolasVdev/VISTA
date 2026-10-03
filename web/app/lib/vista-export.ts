import type { VistaFieldState, VistaMedia } from "./vista-db";

export function reportSignature(field: VistaFieldState) {
  return JSON.stringify({ visit: [field.visit.propertyName, field.visit.address, field.visit.managerName, field.visit.scheduledAt, field.visit.status], zones: field.zones.map((item) => [item.zoneId, item.zoneLabel, item.status, item.inaccessibleReason]), observations: field.observations.map((item) => [item.id, item.updatedAt, item.text, item.severity, item.createAction, item.audio?.id, item.photos.map((photo) => photo.id)]), actions: field.actions.filter((item) => item.visitId === field.visit.id).sort((a, b) => a.id.localeCompare(b.id)).map((item) => [item.id, item.text, item.severity, item.status, item.assignee, item.dueDate]) });
}

type PdfFont = { widthOfTextAtSize: (value: string, size: number) => number; encodeText: (value: string) => unknown };
type PdfImage = { width: number; height: number };
type PdfPage = { drawText: (value: string, options: Record<string, unknown>) => void; drawRectangle: (options: Record<string, unknown>) => void; drawImage: (image: PdfImage, options: Record<string, unknown>) => void };
type PdfDocument = { embedFont: (name: string) => Promise<PdfFont>; embedJpg: (data: ArrayBuffer) => Promise<PdfImage>; addPage: (size: number[]) => PdfPage; getPages: () => PdfPage[]; save: () => Promise<Uint8Array>; setTitle: (value: string) => void; setAuthor: (value: string) => void };
type Zip = { file: (name: string, data: string | Blob | Uint8Array) => Zip; generateAsync: (options: Record<string, unknown>) => Promise<Blob> };
declare global { interface Window {
  PDFLib?: { PDFDocument: { create: () => Promise<PdfDocument> }; StandardFonts: { Helvetica: string; HelveticaBold: string }; rgb: (r: number, g: number, b: number) => unknown };
  JSZip?: new () => Zip;
} }
const scripts = new Map<string, Promise<void>>();
function loadScript(source: string) {
  let request = scripts.get(source);
  if (!request) {
    request = new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = source; script.onload = () => resolve(); script.onerror = () => { scripts.delete(source); script.remove(); reject(new Error("Le module d’export n’est pas disponible. Ouvrez VISTA une fois avec une connexion puis réessayez.")); }; document.head.append(script); });
    scripts.set(source, request);
  }
  return request;
}
const severityLabels = { urgent: "Urgent", planned: "À planifier", info: "Pour info" };
const statusLabels = { pending: "À contrôler", observed: "Constat", clear: "Rien à signaler", inaccessible: "Non accessible" };
const reasonLabels = { missing_key: "Clé ou badge manquant", locked: "Local fermé", occupant_absent: "Occupant absent", unsafe: "Accès dangereux", other: "Autre" };
export function reportBlockers(field: VistaFieldState): string[] {
  return [
    ...(field.visit.status !== "completed" ? ["Clôturez la visite après relecture avant de télécharger le compte rendu final."] : []),
    ...field.observations.filter((item) => item.audio && !item.text?.trim()).map((item) => `${item.zoneLabel} : la note vocale n’a pas de texte. Rouvrez la visite, écoutez-la et complétez son constat.`),
  ];
}
export function exportFileName(field: VistaFieldState, extension: "pdf" | "zip") {
  const name = field.visit.propertyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 70);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(field.visit.scheduledAt));
  return `VISTA-${name}-${day}-${field.visit.id.slice(0, 8)}.${extension}`;
}
async function normalizedPhoto(media: VistaMedia): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(media.blob);
  try {
    const img = new Image(); img.src = url;
    await new Promise<void>((resolve, reject) => { if (img.complete && img.naturalWidth) resolve(); else { img.onload = () => resolve(); img.onerror = () => reject(new Error(`La photo « ${media.fileName} » ne peut pas être intégrée au PDF. Importez une version JPEG ou PNG ; l’original reste conservé.`)); } });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Préparation des photos impossible.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Conversion de photo impossible.")), "image/jpeg", .82));
    return blob.arrayBuffer();
  } finally { URL.revokeObjectURL(url); }
}

export async function generateVisitPdf(field: VistaFieldState): Promise<Blob> {
  const blockers = reportBlockers(field); if (blockers.length) throw new Error(blockers.join(" "));
  await loadScript("/vendor/pdf-lib.min.js"); const library = window.PDFLib; if (!library) throw new Error("Module PDF indisponible.");
  const document = await library.PDFDocument.create(); const regular = await document.embedFont(library.StandardFonts.Helvetica); const bold = await document.embedFont(library.StandardFonts.HelveticaBold);
  const color = (hex: string) => library.rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
  const green = color("#18352b"); const grey = color("#45524c"); const width = 595.28; const height = 841.89; const margin = 44; const usable = width - margin * 2;
  let page!: PdfPage; let y = 0;
  const clean = (value: string) => Array.from(value).filter((char) => char === "\n" || char === "\t" || char.charCodeAt(0) >= 32).join("").replace(/\t/g, " ").replace(/[\u2011\u2013\u2014]/g, "-").split("").map((char) => { if (char === "\n") return char; try { regular.encodeText(char); return char; } catch { return "?"; } }).join("");
  function newPage() {
    page = document.addPage([width, height]); y = height - 70;
    page.drawText("VISTA  /  VISITE TECHNIQUE", { x: margin, y: height - 37, size: 10, font: bold, color: green });
    page.drawRectangle({ x: margin, y: height - 48, width: usable, height: 1, color: color("#deddd5") });
  }
  function room(required: number) { if (y - required < 58) newPage(); }
  function lines(value: string, size: number, font: PdfFont) {
    const result: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= usable) { line = candidate; continue; }
        if (line) { result.push(line); line = ""; }
        for (const char of word) { if (font.widthOfTextAtSize(line + char, size) > usable) { result.push(line); line = char; } else line += char; }
      }
      result.push(line);
    }
    return result;
  }
  function text(value: string, options: { size?: number; strong?: boolean; hex?: string; gap?: number } = {}) {
    const size = options.size ?? 11; const font = options.strong ? bold : regular; const leading = size * 1.45;
    for (const line of lines(value, size, font)) { room(leading); page.drawText(line, { x: margin, y: y - size, size, font, color: options.hex ? color(options.hex) : green }); y -= leading; }
    y -= options.gap ?? 6;
  }
  const excerpt = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit).trimEnd()}… (voir le constat détaillé)` : value;
  newPage(); document.setTitle(`Compte rendu - ${field.visit.propertyName}`); document.setAuthor(field.visit.managerName || "VISTA");
  text("Compte rendu de visite", { size: 23, strong: true, gap: 12 });
  text(field.visit.propertyName, { size: 18, strong: true }); text(field.visit.address);
  text(`Visite du ${new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }).format(new Date(field.visit.scheduledAt))}`);
  text(`Gestionnaire : ${field.visit.managerName || "non renseigné"}`); text(`Référence : ${field.visit.id}`, { size: 8, hex: "#45524c" });
  y -= 8;
  const urgent = field.observations.filter((item) => item.severity === "urgent");
  const selected = field.actions.filter((item) => item.visitId === field.visit.id).sort((a, b) => ({ urgent: 0, planned: 1, info: 2 }[a.severity] - { urgent: 0, planned: 1, info: 2 }[b.severity]));
  text("Synthèse", { size: 16, strong: true });
  text(`${field.zones.length} zones - ${field.observations.length} constat(s) - ${urgent.length} urgent(s) - ${selected.length} action(s) de suivi`);
  if (urgent.length) for (const item of urgent) text(`URGENT - ${item.zoneLabel} : ${excerpt(item.text || "Constat photographique", 220)}`, { strong: true, hex: "#9b2317" });
  else text("Aucun constat marqué urgent.", { hex: "#45524c" });
  if (field.observations.some((item) => item.audio)) text("Des notes vocales ont été prises. Leurs fichiers originaux sont conservés séparément ; le présent document reprend les textes relus par le gestionnaire.", { size: 9, hex: "#45524c" });
  text("Le document restitue les constats de cette visite ; il ne constitue pas un diagnostic technique exhaustif.", { size: 9, hex: "#45524c", gap: 12 });
  for (const zone of field.zones) {
    room(85); y -= 10;
    text(zone.zoneLabel, { size: 16, strong: true });
    text(`${statusLabels[zone.status]}${zone.inaccessibleReason ? ` - ${reasonLabels[zone.inaccessibleReason]}` : ""}`, { size: 10, hex: zone.status === "inaccessible" ? "#6b3300" : "#45524c" });
    const observations = field.observations.filter((item) => item.zoneId === zone.zoneId);
    for (const [index, item] of observations.entries()) {
      room(55);
      const severity = item.severity ?? "info";
      text(`Constat ${index + 1} - ${severityLabels[severity]}${item.createAction ? " - Action de suivi" : ""}`, { strong: true, hex: severity === "urgent" ? "#9b2317" : severity === "planned" ? "#5c4600" : "#1f4f8a" });
      if (item.text) text(item.text); else text("Constat photographique sans commentaire.", { hex: "#45524c" });
      for (const [photoIndex, photo] of item.photos.entries()) {
        const image = await document.embedJpg(await normalizedPhoto(photo));
        const scale = Math.min(usable / image.width, 235 / image.height); const photoWidth = image.width * scale; const photoHeight = image.height * scale;
        room(photoHeight + 70);
        page.drawImage(image, { x: margin, y: y - photoHeight, width: photoWidth, height: photoHeight }); y -= photoHeight + 6;
        text(`${zone.zoneLabel} - constat ${index + 1} - photo ${photoIndex + 1}`, { size: 9, hex: "#45524c", gap: 10 });
      }
    }
  }
  room(65); y -= 12; text("Actions de suivi", { size: 16, strong: true });
  if (!selected.length) text("Aucune action de suivi sélectionnée.");
  for (const item of selected) {
    const action = item;
    const description = excerpt(item.text || "Voir les photos du constat.", 300);
    room(lines(description, 11, regular).length * 16 + 80);
    text(`${severityLabels[item.severity ?? "info"]} - ${item.zoneLabel}`, { strong: true }); text(description);
    text(`Intervenant : ${action?.assignee || "à désigner"} - Échéance : ${action?.dueDate || "à fixer"} - ${action?.status === "done" ? "Faite" : "À faire"}`, { size: 9, hex: "#45524c" });
  }
  const pages = document.getPages(); pages.forEach((entry, index) => {
    entry.drawRectangle({ x: margin, y: 43, width: usable, height: 1, color: color("#deddd5") });
    entry.drawText(`VISTA - ${index + 1} / ${pages.length}`, { x: margin, y: 28, size: 9, font: regular, color: grey });
  });
  const bytes = await document.save(); return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}

export async function generateVisitArchive(field: VistaFieldState): Promise<Blob> {
  await loadScript("/vendor/jszip.min.js"); if (!window.JSZip) throw new Error("Module de sauvegarde indisponible.");
  const zip = new window.JSZip(); const files = new Map<string, string>();
  const reportRecords = field.reports.filter((item) => item.visitId === field.visit.id).map((item) => { const path = `comptes-rendus/v${item.version}.pdf`; zip.file(path, item.blob); return { id: item.id, version: item.version, createdAt: item.createdAt, fileName: item.fileName, path }; });
  function media(item?: VistaMedia) {
    if (!item) return undefined;
    let path = files.get(item.id);
    if (!path) {
      const extension = item.mimeType.includes("jpeg") ? "jpg" : item.mimeType.includes("png") ? "png" : item.mimeType.includes("heic") ? "heic" : item.mimeType.includes("mp4") ? "m4a" : item.mimeType.includes("webm") ? "webm" : "bin";
      path = `medias/${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`; files.set(item.id, path); zip.file(path, item.blob);
    }
    return { id: item.id, mimeType: item.mimeType, fileName: item.fileName, createdAt: item.createdAt, path };
  }
  const payload = { schema: "vista-visit-archive", version: 1, reports: reportRecords, exportedAt: new Date().toISOString(), visit: { ...field.visit, accessNotes: undefined }, zones: field.zones,
    observations: field.observations.map((item) => ({ ...item, audio: media(item.audio), photos: item.photos.map((photo) => media(photo)) })),
    drafts: field.drafts.map((item) => ({ ...item, audio: media(item.audio), photos: item.photos.map((photo) => media(photo)) })),
    actions: field.actions.filter((item) => item.visitId === field.visit.id) };
  zip.file("visite.json", JSON.stringify(payload, null, 2));
  const summary = [`VISTA - ${field.visit.propertyName}`, field.visit.address, `Gestionnaire : ${field.visit.managerName || "non renseigné"}`, `Date : ${field.visit.scheduledAt}`, "", ...field.zones.flatMap((zone) => [zone.zoneLabel, statusLabels[zone.status], ...field.observations.filter((item) => item.zoneId === zone.zoneId).map((item) => `${severityLabels[item.severity ?? "info"]} : ${item.text || "Sans texte"}${item.audio ? " [note vocale dans medias/]" : ""} - ${item.photos.length} photo(s)`), ""])].join("\n");
  zip.file("recapitulatif.txt", summary);
  zip.file("LIRE-MOI.txt", "Sauvegarde VISTA : visite.json contient les données structurées ; medias/ contient les fichiers originaux (photos et audios), y compris les brouillons. recapitulatif.txt est lisible sans application. Les contacts et codes d’accès de la fiche copropriété sont volontairement exclus. Conservez cette archive dans un emplacement privé. La réimportation dans VISTA n’est pas encore disponible dans cette version.");
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE", compressionOptions: { level: 3 } });
}
