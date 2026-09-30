export type VisitStatus = "planned" | "in_progress" | "completed";
export type ZoneStatus = "pending" | "clear" | "observed" | "inaccessible";

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
  id: string;
  propertyName: string;
  address: string;
  scheduledAt: string;
  status: VisitStatus;
  currentZoneId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type VistaZoneProgress = {
  id: string;
  visitId: string;
  zoneId: string;
  zoneLabel: string;
  order: number;
  status: ZoneStatus;
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
};

export type VistaFieldState = {
  visit: VistaVisit;
  zones: VistaZoneProgress[];
  observations: VistaObservation[];
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
const DATABASE_VERSION = 2;
const LEGACY_CAPTURE_STORE = "captures";
const VISIT_STORE = "visits";
const ZONE_STORE = "zone-progress";
const OBSERVATION_STORE = "observations";

export const DEMO_VISIT_ID = "residence-parc-2026-09-30";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

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

    request.onsuccess = () => resolve(request.result);
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
}> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, LEGACY_CAPTURE_STORE],
    "readonly",
  );
  const completion = transactionComplete(transaction);
  const visitRequest = transaction.objectStore(VISIT_STORE).get(DEMO_VISIT_ID);
  const zoneRequest = transaction.objectStore(ZONE_STORE).index("visitId").getAll(DEMO_VISIT_ID);
  const observationRequest = transaction.objectStore(OBSERVATION_STORE).index("visitId").getAll(DEMO_VISIT_ID);
  const legacyRequest = transaction.objectStore(LEGACY_CAPTURE_STORE).getAll();

  const [visit, zones, observations, legacyCaptures] = await Promise.all([
    requestResult(visitRequest) as Promise<VistaVisit | undefined>,
    requestResult(zoneRequest) as Promise<VistaZoneProgress[]>,
    requestResult(observationRequest) as Promise<VistaObservation[]>,
    requestResult(legacyRequest) as Promise<LegacyCapture[]>,
  ]);
  await completion;
  database.close();
  return { visit, zones, observations, legacyCaptures };
}

async function seedMissingState(
  templates: ZoneTemplate[],
  current: Awaited<ReturnType<typeof readState>>,
): Promise<void> {
  const missingZones = defaultZones(templates).filter(
    (zone) => !current.zones.some((savedZone) => savedZone.zoneId === zone.zoneId),
  );
  const migratedObservations = current.observations.length === 0
    ? current.legacyCaptures.map(legacyToObservation)
    : [];

  if (current.visit && missingZones.length === 0 && migratedObservations.length === 0) return;

  const database = await openDatabase();
  const transaction = database.transaction([VISIT_STORE, ZONE_STORE, OBSERVATION_STORE], "readwrite");
  if (!current.visit) transaction.objectStore(VISIT_STORE).put(defaultVisit(templates[0].id));
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
  const observations = stored.observations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const observedZoneIds = new Set(observations.map((observation) => observation.zoneId));
  const zones = stored.zones
    .map((zone) => observedZoneIds.has(zone.zoneId) && zone.status === "pending"
      ? { ...zone, status: "observed" as const }
      : zone)
    .sort((a, b) => a.order - b.order);

  return { visit, zones, observations };
}

export async function saveVisit(visit: VistaVisit): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(VISIT_STORE, "readwrite");
  transaction.objectStore(VISIT_STORE).put(visit);
  await transactionComplete(transaction);
  database.close();
}

export async function saveZoneProgress(zone: VistaZoneProgress): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(ZONE_STORE, "readwrite");
  transaction.objectStore(ZONE_STORE).put(zone);
  await transactionComplete(transaction);
  database.close();
}

export async function saveObservation(observation: VistaObservation): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(OBSERVATION_STORE, "readwrite");
  transaction.objectStore(OBSERVATION_STORE).put(observation);
  await transactionComplete(transaction);
  database.close();
}

export async function resetFieldState(templates: ZoneTemplate[]): Promise<VistaFieldState> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [VISIT_STORE, ZONE_STORE, OBSERVATION_STORE, LEGACY_CAPTURE_STORE],
    "readwrite",
  );
  transaction.objectStore(VISIT_STORE).clear();
  transaction.objectStore(ZONE_STORE).clear();
  transaction.objectStore(OBSERVATION_STORE).clear();
  transaction.objectStore(LEGACY_CAPTURE_STORE).clear();
  await transactionComplete(transaction);
  database.close();
  return loadFieldState(templates);
}
