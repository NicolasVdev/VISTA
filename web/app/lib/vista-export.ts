import type { Severity, VistaFieldState, VistaMedia, ZoneStatus } from "./vista-db";

export function reportSignature(field: VistaFieldState) {
  return JSON.stringify({ visit: [field.visit.propertyName, field.visit.address, field.visit.managerName, field.visit.scheduledAt, field.visit.status], zones: field.zones.map((item) => [item.zoneId, item.zoneLabel, item.status, item.inaccessibleReason]), observations: field.observations.map((item) => [item.id, item.updatedAt, item.text, item.severity, item.createAction, item.audio?.id, item.photos.map((photo) => photo.id)]), actions: field.actions.filter((item) => item.visitId === field.visit.id).sort((a, b) => a.id.localeCompare(b.id)).map((item) => [item.id, item.text, item.severity, item.status, item.assignee, item.dueDate]) });
}

type PdfFont = { widthOfTextAtSize: (value: string, size: number) => number; encodeText: (value: string) => unknown };
type PdfImage = { width: number; height: number };
type PdfPage = { drawText: (value: string, options: Record<string, unknown>) => void; drawRectangle: (options: Record<string, unknown>) => void; drawImage: (image: PdfImage, options: Record<string, unknown>) => void };
type PdfDocument = { embedFont: (name: string) => Promise<PdfFont>; embedJpg: (data: ArrayBuffer) => Promise<PdfImage>; addPage: (size: number[]) => PdfPage; getPages: () => PdfPage[]; save: () => Promise<Uint8Array>; setTitle: (value: string) => void; setAuthor: (value: string) => void };
type Zip = { file: (name: string, data: string | Blob | Uint8Array) => Zip; generateAsync: (options: Record<string, unknown>) => Promise<Blob> };
declare global { interface Window {
  PDFLib?: { PDFDocument: { create: () => Promise<PdfDocument> }; StandardFonts: { Helvetica: string; HelveticaBold: string; HelveticaOblique: string }; rgb: (r: number, g: number, b: number) => unknown };
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
const severityLabels: Record<Severity, string> = { urgent: "Urgent", planned: "À planifier", info: "Pour info" };
const statusLabels: Record<ZoneStatus, string> = { pending: "À contrôler", observed: "Constat", clear: "Rien à signaler", inaccessible: "Non accessible" };
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

// Palette du compte rendu, alignée sur les variables de globals.css.
const INK = "#18352b", MUTED = "#5a6862", SOFT = "#7d8a84", LINE = "#deddd5", HAIR = "#ecebe4", BRAND = "#1e6b4f", DEEP = "#143f30", SURFACE = "#fffef9", PAPER = "#f6f5ef";
const TONE: Record<Severity, { bg: string; fg: string; bd: string }> = {
  urgent: { bg: "#fbeae6", fg: "#9b2317", bd: "#c2412f" },
  planned: { bg: "#f6eed6", fg: "#5c4600", bd: "#a8840e" },
  info: { bg: "#ecebe4", fg: "#45524c", bd: "#8d958f" },
};
const ZONE_TONE: Record<ZoneStatus, { bg: string; fg: string }> = {
  clear: { bg: "#e3efe8", fg: "#154c39" },
  observed: { bg: "#e3ecf8", fg: "#1f4f8a" },
  inaccessible: { bg: "#fbe3cf", fg: "#6b3300" },
  pending: { bg: "#ecebe4", fg: "#45524c" },
};
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
const frDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long" }).format(new Date(value));
const frTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
function frDueDate(value?: string) {
  if (!value) return "à fixer";
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium" }).format(parsed);
}

type TextOptions = { x?: number; w?: number; size?: number; strong?: boolean; italic?: boolean; hex?: string; lead?: number; gap?: number };
type CardRow = { value: string; size?: number; strong?: boolean; italic?: boolean; hex?: string; lead?: number; gap?: number };
type CardLine = { spacer: number } | { line: string; size: number; font: PdfFont; lead: number; hex: string };

export async function generateVisitPdf(field: VistaFieldState): Promise<Blob> {
  const blockers = reportBlockers(field); if (blockers.length) throw new Error(blockers.join(" "));
  await loadScript("/vendor/pdf-lib.min.js"); const library = window.PDFLib; if (!library) throw new Error("Module PDF indisponible.");
  const doc = await library.PDFDocument.create();
  const regular = await doc.embedFont(library.StandardFonts.Helvetica);
  const bold = await doc.embedFont(library.StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(library.StandardFonts.HelveticaOblique);
  const color = (hex: string) => library.rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

  const W = 595.28, H = 841.89, margin = 48, usable = W - margin * 2, floor = 78;
  let page!: PdfPage; let y = 0; let first = true; let sheet = 0;

  // Array.from partout : un .split("") couperait les paires de substitution et rendrait "??" pour un seul emoji.
  const clean = (value: string) => Array.from(Array.from(String(value)).filter((char) => char === "\n" || char === "\t" || char.charCodeAt(0) >= 32).join("").replace(/\t/g, " ").replace(/[‑–—]/g, "-")).map((char) => { if (char === "\n") return char; try { regular.encodeText(char); return char; } catch { return "?"; } }).join("");
  function wrap(value: string, size: number, font: PdfFont, width: number) {
    const result: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) { result.push(line); line = ""; }
        for (const char of word) { if (font.widthOfTextAtSize(line + char, size) > width) { result.push(line); line = char; } else line += char; }
      }
      result.push(line);
    }
    return result;
  }
  const excerpt = (value: string, limit: number) => (clean(value).length > limit ? `${clean(value).slice(0, limit).trimEnd()}…` : clean(value));
  const ellipsis = (value: string, size: number, font: PdfFont, width: number) => {
    const text = clean(value);
    if (font.widthOfTextAtSize(text, size) <= width) return text;
    let cut = text;
    while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };

  const put = (value: string, options: { x: number; y: number; size: number; font?: PdfFont; hex?: string; opacity?: number }) => page.drawText(clean(value), { x: options.x, y: options.y, size: options.size, font: options.font ?? regular, color: color(options.hex ?? INK), ...(options.opacity === undefined ? {} : { opacity: options.opacity }) });
  const rect = (options: { x: number; y: number; w: number; h: number; hex: string; border?: string; borderWidth?: number }) => page.drawRectangle({ x: options.x, y: options.y, width: options.w, height: options.h, color: color(options.hex), ...(options.border ? { borderColor: color(options.border), borderWidth: options.borderWidth ?? 0.8 } : {}) });
  const trackWidth = (value: string, size: number, font: PdfFont, gapBetween: number) => font.widthOfTextAtSize(clean(value), size) + Math.max(0, clean(value).length - 1) * gapBetween;
  function track(value: string, options: { x: number; y: number; size: number; track: number; font?: PdfFont; hex?: string; opacity?: number }) {
    const font = options.font ?? bold;
    let x = options.x;
    for (const char of clean(value)) {
      page.drawText(char, { x, y: options.y, size: options.size, font, color: color(options.hex ?? MUTED), ...(options.opacity === undefined ? {} : { opacity: options.opacity }) });
      x += font.widthOfTextAtSize(char, options.size) + options.track;
    }
  }

  function newPage() {
    page = doc.addPage([W, H]);
    sheet += 1;
    if (first) { first = false; y = H; return; }
    track("VISTA", { x: margin, y: H - 44, size: 8.5, track: 2.2, hex: BRAND });
    const label = "Compte rendu de visite";
    put(label, { x: margin + usable - regular.widthOfTextAtSize(label, 8.5), y: H - 44, size: 8.5, hex: SOFT });
    rect({ x: margin, y: H - 55, w: usable, h: 0.6, hex: LINE });
    y = H - 78;
  }
  const room = (need: number) => { if (y - need < floor) newPage(); };
  const gap = (value: number) => { y -= value; };

  function text(value: string, options: TextOptions = {}) {
    const size = options.size ?? 10.5, font = options.strong ? bold : options.italic ? italic : regular;
    const lead = options.lead ?? size * 1.42, x = options.x ?? margin, width = options.w ?? usable;
    for (const line of wrap(value, size, font, width)) {
      room(lead);
      put(line, { x, y: y - size, size, font, hex: options.hex ?? INK });
      y -= lead;
    }
    gap(options.gap ?? 0);
  }

  const chipWidth = (label: string, size = 8.5, padX = 7) => bold.widthOfTextAtSize(clean(label), size) + padX * 2;
  function chip(label: string, options: { x?: number; right?: number; y: number; bg: string; fg: string; bd?: string; size?: number; padX?: number; h?: number; strong?: boolean }) {
    const size = options.size ?? 8.5, padX = options.padX ?? 7, h = options.h ?? 15;
    const font = options.strong === false ? regular : bold;
    const w = font.widthOfTextAtSize(clean(label), size) + padX * 2;
    const x = options.right === undefined ? options.x ?? margin : options.right - w;
    rect({ x, y: options.y, w, h, hex: options.bg, border: options.bd, borderWidth: 0.7 });
    put(label, { x: x + padX, y: options.y + (h - size) / 2 + 0.8, size, font, hex: options.fg });
    return w;
  }

  // `need` = hauteur du premier bloc de contenu : un titre ne reste jamais seul en bas de page.
  function section(title: string, note?: string, need = 44) {
    room(59 + need);
    gap(16);
    put(title, { x: margin, y: y - 15, size: 15, font: bold, hex: INK });
    if (note) put(note, { x: margin + usable - regular.widthOfTextAtSize(clean(note), 9), y: y - 13, size: 9, hex: SOFT });
    gap(25);
    rect({ x: margin, y, w: 26, h: 2.4, hex: BRAND });
    gap(16);
  }

  // Un en-tête de colonnes, redessiné à chaque fois que le tableau change de page.
  function columns(labels: [string, number | "right"][]) {
    for (const [label, at] of labels) track(label, { x: at === "right" ? margin + usable - trackWidth(label, 7, bold, 1.1) : margin + at, y: y - 8, size: 7, track: 1.1, hex: SOFT });
    gap(15);
    rect({ x: margin, y, w: usable, h: 0.6, hex: LINE });
  }

  // Carte à filet latéral : mesurée d'abord, puis paginée ligne par ligne si elle dépasse.
  function card(rows: CardRow[], options: { bg: string; border?: string; bar?: number; barHex?: string; padX?: number; padTop?: number; padBottom?: number; gap?: number }) {
    const padX = options.padX ?? 14, padTop = options.padTop ?? 11, padBottom = options.padBottom ?? 12, bar = options.bar ?? 0;
    const inner = usable - padX * 2 - bar;
    const flat: CardLine[] = [];
    for (const row of rows) {
      const size = row.size ?? 10.5, font = row.strong ? bold : row.italic ? italic : regular, lead = row.lead ?? size * 1.4;
      for (const line of wrap(row.value, size, font, inner)) flat.push({ line, size, font, lead, hex: row.hex ?? INK });
      if (row.gap) flat.push({ spacer: row.gap });
    }
    let index = 0;
    while (index < flat.length) {
      const firstLines = flat.slice(index, index + 2).reduce((sum, item) => sum + ("spacer" in item ? item.spacer : item.lead), 0);
      room(padTop + firstLines + padBottom);
      let height = padTop, count = 0;
      for (let i = index; i < flat.length; i += 1) {
        const item = flat[i];
        const step = "spacer" in item ? item.spacer : item.lead;
        if (y - (height + step + padBottom) < floor && count > 0) break;
        height += step; count += 1;
      }
      if (!count) { newPage(); continue; }
      height += padBottom;
      rect({ x: margin, y: y - height, w: usable, h: height, hex: options.bg, border: options.border, borderWidth: 0.7 });
      if (bar && options.barHex) rect({ x: margin, y: y - height, w: bar, h: height, hex: options.barHex });
      let cursor = y - padTop;
      for (let i = index; i < index + count; i += 1) {
        const item = flat[i];
        if ("spacer" in item) { cursor -= item.spacer; continue; }
        put(item.line, { x: margin + bar + padX, y: cursor - item.size, size: item.size, font: item.font, hex: item.hex });
        cursor -= item.lead;
      }
      y -= height;
      index += count;
      if (index < flat.length) newPage();
    }
    gap(options.gap ?? 14);
  }

  const visit = field.visit;
  const observations = field.observations;
  const urgent = observations.filter((item) => item.severity === "urgent");
  const order: Record<Severity, number> = { urgent: 0, planned: 1, info: 2 };
  const actions = field.actions.filter((item) => item.visitId === visit.id).sort((a, b) => order[a.severity ?? "info"] - order[b.severity ?? "info"]);
  const counted = (zoneId: string) => observations.filter((item) => item.zoneId === zoneId).length;

  doc.setTitle(`Compte rendu de visite - ${visit.propertyName}`);
  doc.setAuthor(visit.managerName || "VISTA");
  newPage();

  // ---------- Bandeau de couverture ----------
  const nameLines = wrap(visit.propertyName, 24, bold, usable);
  const addressLines = wrap(visit.address, 10.5, regular, usable);
  const bandH = 150 + (nameLines.length - 1) * 28 + (addressLines.length - 1) * 14;
  rect({ x: 0, y: H - bandH, w: W, h: bandH, hex: DEEP });
  rect({ x: 0, y: H - bandH, w: W, h: 2.5, hex: BRAND });
  rect({ x: margin, y: H - 58, w: 28, h: 28, hex: BRAND });
  put("V", { x: margin + 9.5, y: H - 51.5, size: 15, font: bold, hex: "#ffffff" });
  track("VISTA", { x: margin + 40, y: H - 51, size: 13, track: 3.4, hex: "#ffffff" });
  const tagline = "VISITES · INSPECTIONS · SUIVI TECHNIQUE · ACTIONS";
  track(tagline, { x: margin + usable - trackWidth(tagline, 7, bold, 0.8), y: H - 48.5, size: 7, track: 0.8, hex: "#ffffff", opacity: 0.7 });
  let bandY = H - 92;
  track("COMPTE RENDU DE VISITE", { x: margin, y: bandY, size: 8, track: 1.8, hex: "#ffffff", opacity: 0.6 });
  bandY -= 32;
  for (const line of nameLines) { put(line, { x: margin, y: bandY, size: 24, font: bold, hex: "#ffffff" }); bandY -= 28; }
  addressLines.forEach((line, index) => put(line, { x: margin, y: bandY + 6 - index * 14, size: 10.5, hex: "#ffffff", opacity: 0.72 }));
  y = H - bandH - 26;

  // ---------- Identité de la visite ----------
  const meta: [string, string, number][] = [
    ["DATE DE LA VISITE", `${frDate(visit.scheduledAt)} · ${frTime(visit.scheduledAt)}`, 10],
    ["GESTIONNAIRE", visit.managerName || "non renseigné", 10],
  ];
  const metaWidth = usable / meta.length;
  const metaHeight = Math.max(...meta.map(([, value, size]) => wrap(value, size, regular, metaWidth - 14).length * 13));
  meta.forEach(([label, value, size], index) => {
    const x = margin + index * metaWidth;
    track(label, { x, y: y - 8, size: 7, track: 1.1, hex: SOFT });
    wrap(value, size, regular, metaWidth - 14).forEach((line, lineIndex) => put(line, { x, y: y - 24 - lineIndex * 13, size, hex: INK }));
  });
  gap(23 + metaHeight);
  rect({ x: margin, y, w: usable, h: 0.6, hex: LINE });

  // ---------- Synthèse ----------
  section("Synthèse", `parcours de ${plural(field.zones.length, "zone")}`, 76);
  const tiles = [
    { value: String(field.zones.length), label: "ZONES", alert: false },
    { value: String(observations.length), label: observations.length > 1 ? "CONSTATS" : "CONSTAT", alert: false },
    { value: String(urgent.length), label: urgent.length > 1 ? "URGENTS" : "URGENT", alert: urgent.length > 0 },
    { value: String(actions.length), label: actions.length > 1 ? "ACTIONS DE SUIVI" : "ACTION DE SUIVI", alert: false },
  ];
  const tileW = (usable - 3 * 10) / 4, tileH = 62;
  room(tileH + 10);
  tiles.forEach((tile, index) => {
    const x = margin + index * (tileW + 10);
    rect({ x, y: y - tileH, w: tileW, h: tileH, hex: tile.alert ? TONE.urgent.bg : SURFACE, border: tile.alert ? "#e7c3b9" : LINE });
    put(tile.value, { x: x + 13, y: y - 34, size: 22, font: bold, hex: tile.alert ? TONE.urgent.fg : INK });
    track(ellipsis(tile.label, 7, bold, tileW - 26), { x: x + 13, y: y - 50, size: 7, track: 0.9, hex: tile.alert ? TONE.urgent.fg : SOFT });
  });
  gap(tileH + 18);

  if (urgent.length) {
    // Rappel, pas recopie : le texte complet est repris plus bas, dans les constats détaillés.
    const shown = urgent.slice(0, 6);
    card([
      { value: "À traiter en priorité", size: 11.5, strong: true, hex: TONE.urgent.fg, gap: 7 },
      ...shown.map((item) => ({ value: `${item.zoneLabel} · ${excerpt(item.text?.trim() || "constat photographique", 200)}`, size: 10.5, hex: "#7f1d12", gap: 4 })),
      ...(urgent.length > shown.length ? [{ value: `+ ${plural(urgent.length - shown.length, "autre constat")} urgent${urgent.length - shown.length > 1 ? "s" : ""} · voir le détail`, size: 9.5, italic: true, hex: "#7f1d12" }] : []),
    ], { bg: TONE.urgent.bg, border: "#edcbc2", bar: 3.5, barHex: TONE.urgent.bd, gap: 14 });
  } else {
    card([{ value: "Aucun constat urgent relevé lors de cette visite.", size: 10.5, hex: "#154c39" }], { bg: "#e9f2ed", border: "#cde0d6", bar: 3.5, barHex: BRAND, gap: 14 });
  }

  const notes: string[] = [];
  if (observations.some((item) => item.audio)) notes.push("Des notes vocales ont été enregistrées sur le terrain. Leurs fichiers originaux sont conservés séparément ; ce document reprend les textes relus par le gestionnaire.");
  notes.push("Ce document restitue les constats relevés pendant la visite. Il ne constitue pas un diagnostic technique exhaustif.");
  for (const note of notes) text(note, { size: 8.5, italic: true, hex: SOFT, gap: 4 });

  // ---------- État des zones ----------
  const zoneColumns: [string, number | "right"][] = [["ZONE", 0], ["CONSTATS", 300], ["STATUT", "right"]];
  section("État des zones", "vue d'ensemble du parcours", 63);
  columns(zoneColumns);
  let zoneSheet = sheet;
  for (const zone of field.zones) {
    const zoneLines = wrap(zone.zoneLabel, 10.5, bold, 285);
    const reason = zone.inaccessibleReason ? reasonLabels[zone.inaccessibleReason] : "";
    const reasonLines = reason ? wrap(reason, 8, regular, usable - 370) : [];
    const rowHeight = Math.max(24, zoneLines.length * 14 + 10, 24 + reasonLines.length * 11);
    room(rowHeight + 15);
    if (sheet !== zoneSheet) { zoneSheet = sheet; columns(zoneColumns); }
    const count = counted(zone.zoneId);
    const tone = ZONE_TONE[zone.status];
    zoneLines.forEach((line, index) => put(line, { x: margin, y: y - 16 - index * 14, size: 10.5, font: bold, hex: INK }));
    put(count ? plural(count, "constat") : "0 constat", { x: margin + 300, y: y - 16, size: 9.5, hex: count ? INK : SOFT });
    chip(statusLabels[zone.status], { right: margin + usable, y: y - 19, bg: tone.bg, fg: tone.fg, size: 8 });
    reasonLines.forEach((line, index) => put(line, { x: margin + usable - regular.widthOfTextAtSize(clean(line), 8), y: y - 30 - index * 11, size: 8, hex: tone.fg }));
    gap(rowHeight);
    rect({ x: margin, y, w: usable, h: 0.5, hex: HAIR });
  }

  // ---------- Constats détaillés ----------
  const detailed = field.zones.filter((zone) => counted(zone.zoneId) || zone.status === "inaccessible");
  section("Constats détaillés", detailed.length ? `${plural(detailed.length, "zone")} concernée${detailed.length > 1 ? "s" : ""}` : undefined, detailed.length ? 96 : 24);
  if (!detailed.length) text("Aucun constat n'a été enregistré. Les statuts des zones figurent dans le tableau ci-dessus.", { size: 10.5, hex: MUTED });

  for (const zone of detailed) {
    const items = observations.filter((item) => item.zoneId === zone.zoneId);
    room(96);
    gap(8);
    const tone = ZONE_TONE[zone.status];
    const badge = zone.status === "inaccessible" && zone.inaccessibleReason ? `${statusLabels[zone.status]} · ${reasonLabels[zone.inaccessibleReason]}` : statusLabels[zone.status];
    const headingLines = wrap(zone.zoneLabel, 13, bold, usable - chipWidth(badge, 8) - 14);
    room(74 + headingLines.length * 17);
    headingLines.forEach((line, index) => put(line, { x: margin, y: y - 13 - index * 17, size: 13, font: bold, hex: INK }));
    chip(badge, { right: margin + usable, y: y - 16, bg: tone.bg, fg: tone.fg, size: 8 });
    gap(22 + (headingLines.length - 1) * 17);
    rect({ x: margin, y, w: usable, h: 0.6, hex: LINE });
    gap(12);

    if (!items.length) {
      text(zone.status === "inaccessible" ? `Zone non visitée · ${zone.inaccessibleReason ? reasonLabels[zone.inaccessibleReason] : "accès impossible"}.` : "Aucun constat enregistré.", { size: 10, italic: true, hex: SOFT, gap: 8 });
      continue;
    }

    for (const [index, item] of items.entries()) {
      const severity = item.severity ?? "info";
      const tag = TONE[severity];
      room(70);
      const label = `CONSTAT ${index + 1}`;
      track(label, { x: margin, y: y - 10, size: 7.5, track: 1.2, hex: SOFT });
      let chipX = margin + trackWidth(label, 7.5, bold, 1.2) + 12;
      chipX += chip(severityLabels[severity], { x: chipX, y: y - 14, bg: tag.bg, fg: tag.fg, size: 8, h: 14 }) + 6;
      if (item.createAction) chip("Action de suivi", { x: chipX, y: y - 14, bg: "#eef0ef", fg: MUTED, size: 8, h: 14, strong: false });
      gap(20);
      card([{ value: item.text?.trim() || "Constat photographique sans commentaire.", size: 10.5, hex: item.text?.trim() ? INK : SOFT, italic: !item.text?.trim() }], { bg: SURFACE, border: LINE, bar: 3, barHex: tag.bd, gap: item.photos.length ? 10 : 16 });

      // Photos : une seule occupe toute la largeur, sinon deux par rangée.
      // Le cadre épouse l'image — sinon une photo verticale flotte au milieu d'une case trop large.
      // -10 : le cadre ajoute 5 pt de chaque côté, sinon une image très large déborde de la marge.
      const alone = item.photos.length === 1;
      const maxW = alone ? usable - 10 : (usable - 12) / 2 - 10, maxH = alone ? 330 : 215;
      for (let i = 0; i < item.photos.length; i += alone ? 1 : 2) {
        const drawn: { image: PdfImage; w: number; h: number }[] = [];
        for (const photo of item.photos.slice(i, i + (alone ? 1 : 2))) {
          const image = await doc.embedJpg(await normalizedPhoto(photo));
          const scale = Math.min(maxW / image.width, maxH / image.height);
          drawn.push({ image, w: image.width * scale, h: image.height * scale });
        }
        const rowH = Math.max(...drawn.map((entry) => entry.h)) + 10;
        const photoLabels = drawn.map((_, column) => wrap(`${zone.zoneLabel} - constat ${index + 1} - photo ${i + column + 1}`, 7.5, regular, alone ? usable : (usable - 12) / 2));
        const captionH = Math.max(...photoLabels.map((lines) => lines.length)) * 10 + 12;
        room(rowH + captionH);
        let x = margin;
        drawn.forEach((entry, column) => {
          const frameW = entry.w + 10;
          rect({ x, y: y - rowH, w: frameW, h: rowH, hex: PAPER, border: HAIR, borderWidth: 0.6 });
          page.drawImage(entry.image, { x: x + 5, y: y - rowH + (rowH - entry.h) / 2, width: entry.w, height: entry.h });
          photoLabels[column].forEach((line, lineIndex) => put(line, { x, y: y - rowH - 11 - lineIndex * 10, size: 7.5, hex: SOFT }));
          x += alone ? frameW + 12 : (usable + 12) / 2;
        });
        gap(rowH + captionH);
      }
      if (item.photos.length) gap(4);
    }
  }

  // ---------- Actions de suivi ----------
  const colA = 96, colB = 252, colC = usable - colA - colB - 24;
  const actionColumns: [string, number | "right"][] = [["PRIORITÉ", 0], ["ZONE ET DEMANDE", colA + 12], ["TRAITEMENT", colA + colB + 24]];
  section("Actions de suivi", actions.length ? plural(actions.length, "demande") : undefined, actions.length ? 90 : 24);
  if (!actions.length) {
    text("Aucune action de suivi n'a été sélectionnée à la clôture de la visite.", { size: 10.5, hex: MUTED });
  } else {
    columns(actionColumns);
    let actionSheet = sheet;
    for (const action of actions) {
      const tag = TONE[action.severity ?? "info"];
      const content = [
        ...wrap(action.zoneLabel, 10.5, bold, colB).map((line) => ({ line, strong: true })),
        ...wrap(action.text?.trim() || "Voir les photos du constat.", 10, regular, colB).map((line) => ({ line, strong: false })),
      ];
      const treatment = [
        { line: "Intervenant", label: true },
        ...wrap(action.assignee || "À désigner", 9.5, bold, colC).map((line) => ({ line, label: false })),
        { line: "", label: true },
        { line: "Échéance", label: true },
        ...wrap(frDueDate(action.dueDate), 9.5, bold, colC).map((line) => ({ line, label: false })),
      ];
      let contentIndex = 0, treatmentIndex = 0, continued = false;
      while (contentIndex < content.length || treatmentIndex < treatment.length) {
        // Reserve the repeated column header too; never draw a row past the footer.
        room(90);
        if (sheet !== actionSheet) { actionSheet = sheet; columns(actionColumns); }
        const contextLines = continued ? wrap(action.zoneLabel + " (suite)", 9, bold, colB) : [];
        const contextHeight = contextLines.length * 14;
        const capacity = Math.max(1, Math.floor((y - floor - 24 - contextHeight) / 14));
        const count = Math.min(capacity, Math.max(content.length - contentIndex, treatment.length - treatmentIndex));
        gap(12);
        chip(severityLabels[action.severity ?? "info"], { x: margin, y: y - 14, bg: tag.bg, fg: tag.fg, size: 8, h: 15 });
        put(action.status === "done" ? "Faite" : "À faire", { x: margin, y: y - 32, size: 9, font: bold, hex: action.status === "done" ? BRAND : MUTED });
        contextLines.forEach((line, index) => put(line, { x: margin + colA + 12, y: y - 12 - index * 14, size: 9, font: bold, hex: INK }));
        for (let index = 0; index < count; index += 1) {
          const entry = content[contentIndex + index];
          if (entry) put(entry.line, { x: margin + colA + 12, y: y - contextHeight - 12 - index * 14, size: entry.strong ? 10.5 : 10, font: entry.strong ? bold : regular, hex: entry.strong ? INK : MUTED });
          const treatmentLine = treatment[treatmentIndex + index];
          if (treatmentLine?.line) put(treatmentLine.line, { x: margin + colA + colB + 24, y: y - contextHeight - 12 - index * 14, size: treatmentLine.label ? 8 : 9.5, font: treatmentLine.label ? regular : bold, hex: treatmentLine.label ? SOFT : INK });
        }
        gap(Math.max(46, contextHeight + count * 14));
        rect({ x: margin, y, w: usable, h: 0.5, hex: HAIR });
        contentIndex += count; treatmentIndex += count;
        if (contentIndex < content.length || treatmentIndex < treatment.length) { newPage(); continued = true; }
      }
    }
  }

  // Closing belongs to the footer: it cannot create an almost-empty final page.

  // ---------- Pieds de page ----------
  const pages = doc.getPages();
  const stamp = `${clean(visit.propertyName)} · ${frDate(visit.scheduledAt)}`;
  pages.forEach((entry, index) => {
    entry.drawText("Photos reproduites dans le PDF ; originaux et notes vocales dans la sauvegarde de la visite.", { x: margin, y: 64, size: 7, font: italic, color: color(SOFT) });
    entry.drawRectangle({ x: margin, y: 58, width: usable, height: 0.6, color: color(HAIR) });
    entry.drawText(ellipsis(stamp, 8, regular, usable - 90), { x: margin, y: 42, size: 8, font: regular, color: color(SOFT) });
    const number = `${index + 1} / ${pages.length}`;
    entry.drawText(number, { x: margin + usable - bold.widthOfTextAtSize(number, 8), y: 42, size: 8, font: bold, color: color(MUTED) });
  });

  const bytes = await doc.save(); return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
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
