export type VisitStatus = "planned" | "in_progress" | "completed";
export type ZoneStatus = "pending" | "clear" | "observed" | "inaccessible";
export type Severity = "urgent" | "planned" | "info";
export type InaccessibleReason = "missing_key" | "locked" | "occupant_absent" | "unsafe" | "other";
export type FollowUpAction = {
  sourceEdited?: boolean;
  propertyId?: string;
  id: string; visitId: string; observationId: string; zoneId: string; zoneLabel: string;
  propertyName: string; text: string; severity: Severity; status: "open" | "done";
  assignee?: string; dueDate?: string; createdAt: string; updatedAt: string; doneAt?: string;
};
export type VistaDraft = {
  id: string; visitId: string; zoneId: string; text: string; severity: Severity;
  audio?: VistaMedia; photos: VistaMedia[]; editingId?: string;
};

export type ZoneTemplate = {
  id: string;
  label: string;
  hint: string;
};

export type VistaMedia = {
  id: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  createdAt: string;
};

export type VistaVisit = {
  managerName?: string;
  routeVersion?: number;
  propertyId?: string;
  id: string;
  propertyName: string;
  address: string;
  scheduledAt: string;
  status: VisitStatus;
  currentZoneId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  reopenedAt?: string;
  accessNotes?: string;
};

export type VistaZoneProgress = {
  hint?: string;
  id: string;
  visitId: string;
  zoneId: string;
  zoneLabel: string;
  order: number;
  status: ZoneStatus;
  inaccessibleReason?: InaccessibleReason;
  draftText?: string;
  updatedAt: string;
};

export type VistaObservation = {
  id: string;
  visitId: string;
  zoneId: string;
  zoneLabel: string;
  createdAt: string;
  updatedAt: string;
  text?: string;
  audio?: VistaMedia;
  photos: VistaMedia[];
  syncStatus: "local" | "synced";
  severity?: Severity;
  createAction?: boolean;
};

export type VistaFieldState = {
  reports: VistaReport[];
  visits: VistaVisit[];
  property: VistaProperty;
  visit: VistaVisit;
  zones: VistaZoneProgress[];
  observations: VistaObservation[];
  actions: FollowUpAction[];
  drafts: VistaDraft[];
};

export type VistaReport = { id: string; visitId: string; version: number; createdAt: string; fileName: string; blob: Blob; sourceSignature: string };

export type VistaProperty = {
  id: string; name: string; address: string; guardianName?: string;
  guardianPhone?: string; accessCodes?: string; usefulInfo?: string; updatedAt: string;
};

type LegacyCapture = {
  id: string;
  kind: "text" | "audio" | "photo";
  zoneId: string;
  zoneLabel: string;
  createdAt: string;
  text?: string;
  blob?: Blob;
  mimeType?: string;
  fileName?: string;
  syncStatus: "local" | "synced";
};

const DATABASE_NAME = "vista-field-drafts";
const DATABASE_VERSION = 6;
const LEGACY_CAPTURE_STORE = "captures";
const VISIT_STORE = "visits";
const ZONE_STORE = "zone-progress";
const OBSERVATION_STORE = "observations";

export const DEMO_VISIT_ID = "residence-parc-2026-09-30";
const DEMO_PROPERTY_ID = "residence-du-parc";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("reports")) {
        const reports = database.createObjectStore("reports", { keyPath: "id" }); reports.createIndex("visitId", "visitId");
      }
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "id" });
      if (!database.objectStoreNames.contains("properties")) database.createObjectStore("properties", { keyPath: "id" });
      for (const name of ["actions", "drafts"]) {
        if (!database.objectStoreNames.contains(name)) {
          const store = database.createObjectStore(name, { keyPath: "id" });
          store.createIndex("visitId", "visitId");
          if (name === "actions") store.createIndex("status", "status");
        }
      }

      if (!database.objectStoreNames.contains(LEGACY_CAPTURE_STORE)) {
        const legacyStore = database.createObjectStore(LEGACY_CAPTURE_STORE, { keyPath: "id" });
        legacyStore.createIndex("createdAt", "createdAt");
        legacyStore.createIndex("zoneId", "zoneId");
      }

      if (!database.objectStoreNames.contains(VISIT_STORE)) {
        database.createObjectStore(VISIT_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(ZONE_STORE)) {
        const zoneStore = database.createObjectStore(ZONE_STORE, { keyPath: "id" });
        zoneStore.createIndex("visitId", "visitId");
      }

      if (!database.objectStoreNames.contains(OBSERVATION_STORE)) {
        const observationStore = database.createObjectStore(OBSERVATION_STORE, { keyPath: "id" });
        observationStore.createIndex("visitId", "visitId");
        observationStore.createIndex("zoneId", "zoneId");
        observationStore.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function defaultVisit(firstZoneId: string): VistaVisit {
  const now = new Date().toISOString();
  return {
    id: DEMO_VISIT_ID,
    propertyId: DEMO_PROPERTY_ID,
    propertyName: "Résidence du Parc",
    address: "12 rue des Tilleuls · 75015 Paris",
    scheduledAt: "2026-09-30T09:30:00+02:00",
    status: "planned",
    currentZoneId: firstZoneId,
    createdAt: now,
    updatedAt: now,
  };
}

function defaultZones(templates: ZoneTemplate[], visitId = DEMO_VISIT_ID): VistaZoneProgress[] {
  const now = new Date().toISOString();
  return templates.map((zone, order) => ({
    id: `${visitId}:${zone.id}`,
    visitId,
    hint: zone.hint,
    zoneId: zone.id,
    zoneLabel: zone.label,
    order,
    status: "pending",
    updatedAt: now,
  }));
}

function legacyToObservation(capture: LegacyCapture): VistaObservation {
  const media = capture.blob ? {
    id: `${capture.id}:media`,
    blob: capture.blob,
    mimeType: capture.mimeType ?? capture.blob.type,
    fileName: capture.fileName ?? `${capture.kind}-${capture.id}`,
    createdAt: capture.createdAt,
  } : undefined;

  return {
    id: `legacy:${capture.id}`,
    visitId: DEMO_VISIT_ID,
    zoneId: capture.zoneId,
    zoneLabel: capture.zoneLabel,
    createdAt: capture.createdAt,
    updatedAt: capture.createdAt,
    text: capture.text,
    audio: capture.kind === "audio" ? media : undefined,
    photos: capture.kind === "photo" && media ? [media] : [],
    syncStatus: capture.syncStatus,
  };
}

async function readState(requestedVisitId?: string): Promise<{
  reports: VistaReport[];
  visits: VistaVisit[];
  visit?: VistaVisit;
  zones: VistaZoneProgress[];
  observations: VistaObservation[];
  legacyCaptures: LegacyCapture[];
  actions: FollowUpAction[];
  drafts: VistaDraft[];
  properties: VistaProperty[];
}> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, LEGACY_CAPTURE_STORE, "actions", "drafts", "properties", "settings", "reports"],
    "readonly",
  );
  const completion = transactionComplete(transaction);
  const visitRequest = transaction.objectStore(VISIT_STORE).getAll();
  const zoneRequest = transaction.objectStore(ZONE_STORE).getAll();
  const observationRequest = transaction.objectStore(OBSERVATION_STORE).getAll();
  const legacyRequest = transaction.objectStore(LEGACY_CAPTURE_STORE).getAll();

  const [visits, allZones, allObservations, legacyCaptures, actions, allDrafts, properties, selection, reports] = await Promise.all([
    requestResult(visitRequest) as Promise<VistaVisit[]>,
    requestResult(zoneRequest) as Promise<VistaZoneProgress[]>,
    requestResult(observationRequest) as Promise<VistaObservation[]>,
    requestResult(legacyRequest) as Promise<LegacyCapture[]>,
    requestResult(transaction.objectStore("actions").getAll()) as Promise<FollowUpAction[]>,
    requestResult(transaction.objectStore("drafts").getAll()) as Promise<VistaDraft[]>,
    requestResult(transaction.objectStore("properties").getAll()) as Promise<VistaProperty[]>,
    requestResult(transaction.objectStore("settings").get("active-visit")) as Promise<{ value: string } | undefined>,
    requestResult(transaction.objectStore("reports").getAll()) as Promise<VistaReport[]>,
  ]);
  await completion;
  database.close();
  const visit = visits.find((item) => item.id === (requestedVisitId ?? selection?.value)) ?? visits.find((item) => item.id === DEMO_VISIT_ID) ?? visits[0];
  const visitId = visit?.id ?? DEMO_VISIT_ID;
  return { reports, visit, visits, zones: allZones.filter((item) => item.visitId === visitId), observations: allObservations.filter((item) => item.visitId === visitId), legacyCaptures, actions, drafts: allDrafts.filter((item) => item.visitId === visitId), properties };
}

async function seedMissingState(
  templates: ZoneTemplate[],
  current: Awaited<ReturnType<typeof readState>>,
): Promise<void> {
  const missingZones = current.visit?.routeVersion ? [] : defaultZones(templates, current.visit?.id).filter(
    (zone) => !current.zones.some((savedZone) => savedZone.zoneId === zone.zoneId),
  );
  const migratedObservations = !current.visit && current.observations.length === 0
    ? current.legacyCaptures.map(legacyToObservation)
    : [];

  const visit = current.visit ?? defaultVisit(templates[0].id);
  const propertyId = visit.propertyId ?? DEMO_PROPERTY_ID;
  const propertyExists = current.properties.some((property) => property.id === propertyId);
  if (current.visit?.propertyId && current.visit.routeVersion && propertyExists && missingZones.length === 0 && migratedObservations.length === 0) return;

  const database = await openDatabase();
  const transaction = database.transaction([VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, "properties"], "readwrite");
  if (!current.visit?.propertyId || !current.visit.routeVersion) transaction.objectStore(VISIT_STORE).put({ ...visit, propertyId, routeVersion: 1 });
  if (!propertyExists) transaction.objectStore("properties").put({ id: propertyId, name: visit.propertyName, address: visit.address, usefulInfo: visit.accessNotes, updatedAt: new Date().toISOString() });
  const zoneStore = transaction.objectStore(ZONE_STORE);
  missingZones.forEach((zone) => zoneStore.put(zone));
  const observationStore = transaction.objectStore(OBSERVATION_STORE);
  migratedObservations.forEach((observation) => observationStore.put(observation));
  await transactionComplete(transaction);
  database.close();
}

export async function loadFieldState(templates: ZoneTemplate[], visitId?: string): Promise<VistaFieldState> {
  const initial = await readState(visitId);
  await seedMissingState(templates, initial);
  const stored = await readState(visitId);
  const visit = stored.visit ?? defaultVisit(templates[0].id);
  const observations = stored.observations.map((item) => ({ ...item, severity: item.severity ?? "info", createAction: item.createAction ?? false })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const observedZoneIds = new Set(observations.map((observation) => observation.zoneId));
  const zones = stored.zones
    .map((zone) => observedZoneIds.has(zone.zoneId) && zone.status !== "observed"
      ? { ...zone, status: "observed" as const }
      : zone)
    .sort((a, b) => a.order - b.order);

  const property = stored.properties.find((item) => item.id === visit.propertyId)!;
  return { reports: stored.reports, visit, property, zones, observations, actions: stored.actions, drafts: stored.drafts, visits: stored.visits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export async function saveVisit(visit: VistaVisit): Promise<void> {
  await mutateVisit(visit.id, [], async (transaction, stored) => {
    if (visit.status === "completed" && stored.status !== "completed") throw new Error("Utilisez la clôture de visite.");
    if (stored.status === "completed") {
      if (visit.status !== "completed") throw new Error("Utilisez la réouverture de visite.");
      transaction.objectStore(VISIT_STORE).put({ ...stored, currentZoneId: visit.currentZoneId });
    } else transaction.objectStore(VISIT_STORE).put(visit);
  }, true);
}

export async function saveZoneProgress(zone: VistaZoneProgress): Promise<void> {
  await mutateVisit(zone.visitId, [ZONE_STORE, OBSERVATION_STORE], async (transaction) => {
    const items = await requestResult(transaction.objectStore(OBSERVATION_STORE).index("visitId").getAll(zone.visitId)) as VistaObservation[];
    if (items.some((item) => item.zoneId === zone.zoneId) && zone.status !== "observed") throw new Error("Cette zone contient des constats.");
    if (!items.some((item) => item.zoneId === zone.zoneId) && zone.status === "observed") throw new Error("Ajoutez un constat pour renseigner cette zone.");
    transaction.objectStore(ZONE_STORE).put({ ...zone, inaccessibleReason: zone.status === "inaccessible" ? zone.inaccessibleReason : undefined });
  });
}

export async function saveObservation(observation: VistaObservation, consumeDraft = false): Promise<void> {
  await mutateVisit(observation.visitId, [OBSERVATION_STORE, ZONE_STORE, "drafts"], async (transaction) => {
    const zoneStore = transaction.objectStore(ZONE_STORE);
    const zone = await requestResult(zoneStore.get(`${observation.visitId}:${observation.zoneId}`)) as VistaZoneProgress;
    transaction.objectStore(OBSERVATION_STORE).put(observation);
    zoneStore.put({ ...zone, status: "observed", inaccessibleReason: undefined, draftText: consumeDraft ? undefined : zone.draftText, updatedAt: observation.updatedAt });
    if (consumeDraft) transaction.objectStore("drafts").delete(`${observation.visitId}:${observation.zoneId}`);
  });
}

export async function resetFieldState(templates: ZoneTemplate[]): Promise<VistaFieldState> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, LEGACY_CAPTURE_STORE, "actions", "drafts", "reports"],
    "readwrite",
  );
  transaction.objectStore(VISIT_STORE).delete(DEMO_VISIT_ID);
  for (const name of [ZONE_STORE, OBSERVATION_STORE, "actions", "drafts", "reports"]) {
    const store = transaction.objectStore(name);
    const rows = await requestResult(store.index("visitId").getAll(DEMO_VISIT_ID)) as { id: string }[];
    rows.forEach((row) => store.delete(row.id));
  }
  transaction.objectStore(LEGACY_CAPTURE_STORE).clear();
  await transactionComplete(transaction);
  database.close();
  return loadFieldState(templates);
}

export async function selectFieldVisit(visitId: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([VISIT_STORE, "settings"], "readwrite");
    const completion = transactionComplete(transaction);
    const visit = await requestResult(transaction.objectStore(VISIT_STORE).get(visitId));
    if (!visit) { await completion; throw new Error("Visite introuvable."); }
    transaction.objectStore("settings").put({ id: "active-visit", value: visitId });
    await completion;
  } finally { database.close(); }
}

export async function createFieldVisit(details: { propertyName: string; address: string; managerName: string; scheduledAt: string }, route: ZoneTemplate[]): Promise<string> {
  if (!details.propertyName.trim() || !details.address.trim() || !details.managerName.trim() || !Number.isFinite(Date.parse(details.scheduledAt))) throw new Error("Renseignez la résidence, l’adresse, le gestionnaire et la date.");
  validateRoute(route);
  const database = await openDatabase();
  try {
    const transaction = database.transaction([VISIT_STORE, ZONE_STORE, "properties", "settings"], "readwrite");
    const completion = transactionComplete(transaction);
    const properties = await requestResult(transaction.objectStore("properties").getAll()) as VistaProperty[];
    const propertyName = details.propertyName.trim(); const address = details.address.trim(); const now = new Date().toISOString();
    const existing = properties.find((item) => item.name.trim().toLocaleLowerCase() === propertyName.toLocaleLowerCase() && item.address.trim().toLocaleLowerCase() === address.toLocaleLowerCase());
    const propertyId = existing?.id ?? crypto.randomUUID(); const id = crypto.randomUUID();
    if (!existing) transaction.objectStore("properties").put({ id: propertyId, name: propertyName, address, updatedAt: now });
    transaction.objectStore(VISIT_STORE).put({ ...details, propertyName, address, managerName: details.managerName.trim(), id, propertyId, routeVersion: 1, status: "planned", currentZoneId: route[0].id, createdAt: now, updatedAt: now });
    defaultZones(route, id).forEach((zone) => transaction.objectStore(ZONE_STORE).put(zone));
    transaction.objectStore("settings").put({ id: "active-visit", value: id });
    await completion; return id;
  } finally { database.close(); }
}

function validateRoute(route: ZoneTemplate[]) {
  if (!route.length || route.length > 100 || route.some((zone) => !zone.id || !zone.label.trim()) || new Set(route.map((zone) => zone.id)).size !== route.length) throw new Error("Le parcours doit comporter de 1 à 100 zones nommées et distinctes.");
}

export async function saveVisitRoute(visitId: string, route: ZoneTemplate[]) {
  validateRoute(route);
  await mutateVisit(visitId, [ZONE_STORE, OBSERVATION_STORE, "drafts", "actions"], async (transaction, visit) => {
    const store = transaction.objectStore(ZONE_STORE);
    const previous = await requestResult(store.index("visitId").getAll(visitId)) as VistaZoneProgress[];
    const observations = await requestResult(transaction.objectStore(OBSERVATION_STORE).index("visitId").getAll(visitId)) as VistaObservation[];
    const drafts = await requestResult(transaction.objectStore("drafts").index("visitId").getAll(visitId)) as VistaDraft[];
    const actions = await requestResult(transaction.objectStore("actions").index("visitId").getAll(visitId)) as FollowUpAction[];
    const deleted = previous.filter((zone) => !route.some((next) => next.id === zone.zoneId));
    if (deleted.some((zone) => observations.some((item) => item.zoneId === zone.zoneId) || drafts.some((item) => item.zoneId === zone.zoneId && (item.text.trim() || item.audio || item.photos.length)) || actions.some((item) => item.zoneId === zone.zoneId))) throw new Error("Une zone contenant un constat, une action ou un brouillon ne peut pas être supprimée. Videz-la d’abord ou marquez-la non accessible.");
    const now = new Date().toISOString();
    deleted.forEach((zone) => { store.delete(zone.id); transaction.objectStore("drafts").delete(`${visitId}:${zone.zoneId}`); });
    route.forEach((zone, order) => {
      const saved = previous.find((item) => item.zoneId === zone.id);
      store.put({ ...saved, id: `${visitId}:${zone.id}`, visitId, zoneId: zone.id, zoneLabel: zone.label.trim(), hint: zone.hint.trim(), order, status: saved?.status ?? "pending", updatedAt: now });
      observations.filter((item) => item.zoneId === zone.id).forEach((item) => transaction.objectStore(OBSERVATION_STORE).put({ ...item, zoneLabel: zone.label.trim() }));
      actions.filter((item) => item.zoneId === zone.id).forEach((item) => transaction.objectStore("actions").put({ ...item, zoneLabel: zone.label.trim() }));
    });
    transaction.objectStore(VISIT_STORE).put({ ...visit, routeVersion: 1, currentZoneId: route.some((zone) => zone.id === visit.currentZoneId) ? visit.currentZoneId : route[0].id, updatedAt: now });
  });
}

async function mutateVisit(visitId: string, stores: string[], operation: (transaction: IDBTransaction, visit: VistaVisit) => Promise<void>, allowCompleted = false) {
  const database = await openDatabase();
  const transaction = database.transaction([...new Set([VISIT_STORE, ...stores])], "readwrite");
  const completion = transactionComplete(transaction);
  try {
    const visit = await requestResult(transaction.objectStore(VISIT_STORE).get(visitId)) as VistaVisit | undefined;
    if (!visit || (!allowCompleted && visit.status === "completed")) throw new Error("Visite clôturée : rouvrez-la pour la modifier.");
    await operation(transaction, visit);
    await completion;
  } catch (error) {
    try { transaction.abort(); } catch { /* Transaction already finished. */ }
    await completion.catch(() => undefined);
    throw error;
  } finally { database.close(); }
}

export async function saveDraft(draft: VistaDraft) {
  await mutateVisit(draft.visitId, ["drafts", ZONE_STORE], async (transaction) => {
    const store = transaction.objectStore(ZONE_STORE);
    const zone = await requestResult(store.get(`${draft.visitId}:${draft.zoneId}`)) as VistaZoneProgress;
    transaction.objectStore("drafts").put(draft);
    store.put({ ...zone, draftText: draft.text });
  });
}

export async function deleteObservation(observation: VistaObservation) {
  let removedActions: FollowUpAction[] = [];
  await mutateVisit(observation.visitId, [OBSERVATION_STORE, ZONE_STORE, "actions"], async (transaction) => {
    const store = transaction.objectStore(OBSERVATION_STORE);
    const items = await requestResult(store.index("visitId").getAll(observation.visitId)) as VistaObservation[];
    const actions = await requestResult(transaction.objectStore("actions").index("visitId").getAll(observation.visitId)) as FollowUpAction[];
    removedActions = actions.filter((item) => item.observationId === observation.id && item.status === "open");
    store.delete(observation.id);
    removedActions.forEach((item) => transaction.objectStore("actions").delete(item.id));
    if (!items.some((item) => item.id !== observation.id && item.zoneId === observation.zoneId)) {
      const zoneStore = transaction.objectStore(ZONE_STORE);
      const zone = await requestResult(zoneStore.get(`${observation.visitId}:${observation.zoneId}`)) as VistaZoneProgress;
      zoneStore.put({ ...zone, status: "pending", updatedAt: new Date().toISOString() });
    }
  });
  return removedActions;
}

export async function restoreObservation(observation: VistaObservation, actions: FollowUpAction[] = []) {
  await saveObservation(observation);
  for (const action of actions) if (action.status === "open") await saveAction(action);
}

export async function splitAction(originalId: string, entries: { text: string; assignee?: string; dueDate?: string; severity: Severity }[]) {
  if (entries.length < 2 || entries.length > 20 || entries.some((item) => !item.text.trim() || !["urgent", "planned", "info"].includes(item.severity) || (item.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)))) throw new Error("Renseignez de 2 à 20 actions distinctes avec des dates valides.");
  const database = await openDatabase();
  try {
    const transaction = database.transaction("actions", "readwrite"); const completion = transactionComplete(transaction); const store = transaction.objectStore("actions");
    const original = await requestResult(store.get(originalId)) as FollowUpAction | undefined;
    if (!original || original.status !== "open") { await completion; throw new Error("Seule une action ouverte peut être scindée."); }
    const now = new Date().toISOString();
    entries.forEach((entry, index) => store.put({ ...original, ...entry, text: entry.text.trim(), assignee: entry.assignee?.trim() || undefined, dueDate: entry.dueDate || undefined, sourceEdited: true, id: index === 0 ? original.id : `action:${crypto.randomUUID()}`, createdAt: index === 0 ? original.createdAt : now, updatedAt: now }));
    await completion;
  } finally { database.close(); }
}

export async function saveVisitReport(report: Omit<VistaReport, "id" | "version" | "createdAt">): Promise<VistaReport> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(["reports", VISIT_STORE], "readwrite"); const completion = transactionComplete(transaction); const store = transaction.objectStore("reports");
    const visit = await requestResult(transaction.objectStore(VISIT_STORE).get(report.visitId)) as VistaVisit | undefined;
    if (!visit || visit.status !== "completed") { await completion; throw new Error("La visite doit être clôturée pour conserver son PDF."); }
    const previous = await requestResult(store.index("visitId").getAll(report.visitId)) as VistaReport[];
    const version = Math.max(0, ...previous.map((item) => item.version)) + 1;
    const saved = { ...report, id: crypto.randomUUID(), version, createdAt: new Date().toISOString(), fileName: report.fileName.replace(/\.pdf$/, `-v${version}.pdf`) };
    store.put(saved); await completion; return saved;
  } finally { database.close(); }
}

export async function saveAction(action: FollowUpAction) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("actions", "readwrite");
    transaction.objectStore("actions").put(action);
    await transactionComplete(transaction);
  } finally { database.close(); }
}

export async function saveProperty(property: VistaProperty) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("properties", "readwrite");
    transaction.objectStore("properties").put(property);
    await transactionComplete(transaction);
  } finally { database.close(); }
}

export async function closeFieldVisit(visitId: string) {
  await mutateVisit(visitId, [ZONE_STORE, OBSERVATION_STORE, "actions", "drafts"], async (transaction, visit) => {
    const zones = await requestResult(transaction.objectStore(ZONE_STORE).index("visitId").getAll(visitId)) as VistaZoneProgress[];
    const observations = await requestResult(transaction.objectStore(OBSERVATION_STORE).index("visitId").getAll(visitId)) as VistaObservation[];
    // Old captures may predate their zone's stored status. Derive the same
    // effective status as loadFieldState, then normalize it in this transaction.
    const observedIds = new Set(observations.map((item) => item.zoneId));
    if (zones.some((zone) => zone.status === "pending" && !observedIds.has(zone.zoneId))) throw new Error("Certaines zones restent à contrôler.");
    for (const zone of zones) {
      if (observedIds.has(zone.zoneId) && zone.status !== "observed") transaction.objectStore(ZONE_STORE).put({ ...zone, status: "observed", inaccessibleReason: undefined });
    }
    const actionStore = transaction.objectStore("actions");
    const actions = await requestResult(actionStore.index("visitId").getAll(visitId)) as FollowUpAction[];
    const now = new Date().toISOString();
    for (const observation of observations) {
      const linked = actions.filter((action) => action.observationId === observation.id);
      const existing = linked[0];
      if (observation.createAction) {
        if (linked.some((action) => action.sourceEdited)) continue;
        actionStore.put({ ...existing, id: `action:${observation.id}`, visitId, observationId: observation.id,
          propertyId: visit.propertyId,
          zoneId: observation.zoneId, zoneLabel: observation.zoneLabel, propertyName: visit.propertyName,
          text: observation.text || "Constat avec pièce jointe", severity: observation.severity ?? "info",
          status: existing?.status ?? "open", createdAt: existing?.createdAt ?? now, updatedAt: now });
      }
    }
    for (const action of actions) {
      if (action.status === "open" && !observations.some((item) => item.id === action.observationId && item.createAction)) actionStore.delete(action.id);
    }
    transaction.objectStore(VISIT_STORE).put({ ...visit, status: "completed", completedAt: now, updatedAt: now });
  });
}

export async function reopenFieldVisit(visitId: string) {
  await mutateVisit(visitId, [], async (transaction, visit) => {
    const now = new Date().toISOString();
    transaction.objectStore(VISIT_STORE).put({ ...visit, status: "in_progress", completedAt: undefined, reopenedAt: now, updatedAt: now });
  }, true);
}
