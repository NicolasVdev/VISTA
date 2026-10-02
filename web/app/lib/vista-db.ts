export type VisitStatus = "planned" | "in_progress" | "completed";
export type ZoneStatus = "pending" | "clear" | "observed" | "inaccessible";
export type Severity = "urgent" | "planned" | "info";
export type InaccessibleReason = "missing_key" | "locked" | "occupant_absent" | "unsafe" | "other";
export type FollowUpAction = {
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
  property: VistaProperty;
  visit: VistaVisit;
  zones: VistaZoneProgress[];
  observations: VistaObservation[];
  actions: FollowUpAction[];
  drafts: VistaDraft[];
};

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
const DATABASE_VERSION = 4;
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

function defaultZones(templates: ZoneTemplate[]): VistaZoneProgress[] {
  const now = new Date().toISOString();
  return templates.map((zone, order) => ({
    id: `${DEMO_VISIT_ID}:${zone.id}`,
    visitId: DEMO_VISIT_ID,
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

async function readState(): Promise<{
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
    [VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, LEGACY_CAPTURE_STORE, "actions", "drafts", "properties"],
    "readonly",
  );
  const completion = transactionComplete(transaction);
  const visitRequest = transaction.objectStore(VISIT_STORE).get(DEMO_VISIT_ID);
  const zoneRequest = transaction.objectStore(ZONE_STORE).index("visitId").getAll(DEMO_VISIT_ID);
  const observationRequest = transaction.objectStore(OBSERVATION_STORE).index("visitId").getAll(DEMO_VISIT_ID);
  const legacyRequest = transaction.objectStore(LEGACY_CAPTURE_STORE).getAll();

  const [visit, zones, observations, legacyCaptures, actions, drafts, properties] = await Promise.all([
    requestResult(visitRequest) as Promise<VistaVisit | undefined>,
    requestResult(zoneRequest) as Promise<VistaZoneProgress[]>,
    requestResult(observationRequest) as Promise<VistaObservation[]>,
    requestResult(legacyRequest) as Promise<LegacyCapture[]>,
    requestResult(transaction.objectStore("actions").getAll()) as Promise<FollowUpAction[]>,
    requestResult(transaction.objectStore("drafts").index("visitId").getAll(DEMO_VISIT_ID)) as Promise<VistaDraft[]>,
    requestResult(transaction.objectStore("properties").getAll()) as Promise<VistaProperty[]>,
  ]);
  await completion;
  database.close();
  return { visit, zones, observations, legacyCaptures, actions, drafts, properties };
}

async function seedMissingState(
  templates: ZoneTemplate[],
  current: Awaited<ReturnType<typeof readState>>,
): Promise<void> {
  const missingZones = defaultZones(templates).filter(
    (zone) => !current.zones.some((savedZone) => savedZone.zoneId === zone.zoneId),
  );
  const migratedObservations = !current.visit && current.observations.length === 0
    ? current.legacyCaptures.map(legacyToObservation)
    : [];

  const visit = current.visit ?? defaultVisit(templates[0].id);
  const propertyId = visit.propertyId ?? DEMO_PROPERTY_ID;
  const propertyExists = current.properties.some((property) => property.id === propertyId);
  if (current.visit?.propertyId && propertyExists && missingZones.length === 0 && migratedObservations.length === 0) return;

  const database = await openDatabase();
  const transaction = database.transaction([VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, "properties"], "readwrite");
  if (!current.visit?.propertyId) transaction.objectStore(VISIT_STORE).put({ ...visit, propertyId });
  if (!propertyExists) transaction.objectStore("properties").put({ id: propertyId, name: visit.propertyName, address: visit.address, usefulInfo: visit.accessNotes, updatedAt: new Date().toISOString() });
  const zoneStore = transaction.objectStore(ZONE_STORE);
  missingZones.forEach((zone) => zoneStore.put(zone));
  const observationStore = transaction.objectStore(OBSERVATION_STORE);
  migratedObservations.forEach((observation) => observationStore.put(observation));
  await transactionComplete(transaction);
  database.close();
}

export async function loadFieldState(templates: ZoneTemplate[]): Promise<VistaFieldState> {
  const initial = await readState();
  await seedMissingState(templates, initial);
  const stored = await readState();
  const visit = stored.visit ?? defaultVisit(templates[0].id);
  const observations = stored.observations.map((item) => ({ ...item, severity: item.severity ?? "info", createAction: item.createAction ?? false })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const observedZoneIds = new Set(observations.map((observation) => observation.zoneId));
  const zones = stored.zones
    .map((zone) => observedZoneIds.has(zone.zoneId) && zone.status !== "observed"
      ? { ...zone, status: "observed" as const }
      : zone)
    .sort((a, b) => a.order - b.order);

  const property = stored.properties.find((item) => item.id === visit.propertyId)!;
  return { visit, property, zones, observations, actions: stored.actions, drafts: stored.drafts };
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
    [VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, LEGACY_CAPTURE_STORE, "actions", "drafts"],
    "readwrite",
  );
  transaction.objectStore(VISIT_STORE).clear();
  transaction.objectStore(ZONE_STORE).clear();
  transaction.objectStore(OBSERVATION_STORE).clear();
  transaction.objectStore(LEGACY_CAPTURE_STORE).clear();
  transaction.objectStore("actions").clear();
  transaction.objectStore("drafts").clear();
  await transactionComplete(transaction);
  database.close();
  return loadFieldState(templates);
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
  let removedAction: FollowUpAction | undefined;
  await mutateVisit(observation.visitId, [OBSERVATION_STORE, ZONE_STORE, "actions"], async (transaction) => {
    const store = transaction.objectStore(OBSERVATION_STORE);
    const items = await requestResult(store.index("visitId").getAll(observation.visitId)) as VistaObservation[];
    removedAction = await requestResult(transaction.objectStore("actions").get(`action:${observation.id}`)) as FollowUpAction | undefined;
    store.delete(observation.id);
    if (removedAction?.status === "open") transaction.objectStore("actions").delete(removedAction.id);
    if (!items.some((item) => item.id !== observation.id && item.zoneId === observation.zoneId)) {
      const zoneStore = transaction.objectStore(ZONE_STORE);
      const zone = await requestResult(zoneStore.get(`${observation.visitId}:${observation.zoneId}`)) as VistaZoneProgress;
      zoneStore.put({ ...zone, status: "pending", updatedAt: new Date().toISOString() });
    }
  });
  return removedAction;
}

export async function restoreObservation(observation: VistaObservation, action?: FollowUpAction) {
  await saveObservation(observation);
  if (action?.status === "open") await saveAction(action);
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
      const existing = actions.find((action) => action.observationId === observation.id);
      if (observation.createAction) {
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
