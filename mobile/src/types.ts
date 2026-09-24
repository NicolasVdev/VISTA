export type ZoneStatus = 'remaining' | 'visited' | 'clear' | 'unavailable';

export type SyncStatus =
  | 'local'
  | 'waiting'
  | 'uploading'
  | 'synced'
  | 'error';

export type Zone = {
  id: string;
  name: string;
  detail: string;
  order: number;
  status: ZoneStatus;
};

export type Capture = {
  id: string;
  zoneId: string;
  createdAt: string;
  text: string;
  audioUri?: string;
  audioDurationMs?: number;
  photoUris: string[];
  syncStatus: SyncStatus;
};

export type VisitState = {
  id: string;
  propertyName: string;
  currentZoneId: string;
  zones: Zone[];
  captures: Capture[];
  closedAt?: string;
};
