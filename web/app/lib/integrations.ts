import type { VistaVisit } from "./vista-db";

// Ports implemented by an authenticated backend, never by storing OAuth tokens
// in the browser. Their presence is not a connected account or a working API.
export type IntegrationCapability = "calendar" | "documents" | "property-directory";
export type ExternalReference = { providerId: string; externalId: string; version?: string };
export type CalendarEvent = { vistaVisitId: string; title: string; location: string; startsAt: string; endsAt: string; reminderMinutes: number[] };
export type PrivateDocument = { visitId: string; propertyId?: string; reportId: string; fileName: string; blob: Blob };
export interface CalendarPort {
  upsert(event: CalendarEvent, previous?: ExternalReference): Promise<ExternalReference>;
  cancel(reference: ExternalReference): Promise<void>;
}
export interface DocumentPort { upload(document: PrivateDocument): Promise<ExternalReference> }
export interface PropertyDirectoryPort {
  readProperty(externalId: string): Promise<{ externalId: string; name: string; address: string }>;
  // Private contacts/access require a separate user authorization and scope.
}
export type BackendIntegration = { providerId: string; calendar?: CalendarPort; documents?: DocumentPort; directory?: PropertyDirectoryPort };
export const integrationCandidates = [
  { id: "google-workspace", name: "Google Agenda", capabilities: ["calendar"] },
  { id: "microsoft-365", name: "Microsoft 365", capabilities: ["calendar", "documents"] },
  { id: "syndic-software", name: "Logiciel métier du syndic", capabilities: ["calendar", "documents", "property-directory"] },
] as const;

export function calendarEventForVisit(visit: VistaVisit, durationMinutes: number, reminderMinutes: number[]): CalendarEvent {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440 || reminderMinutes.some((item) => !Number.isInteger(item) || item < 0 || item > 40320)) throw new Error("Durée ou rappels invalides.");
  const start = new Date(visit.scheduledAt); if (!Number.isFinite(start.getTime())) throw new Error("Date de visite invalide.");
  // Deliberately exclude access codes, occupants, guardian and observations.
  return { vistaVisitId: visit.id, title: `Visite VISTA - ${visit.propertyName}`, location: visit.address, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + durationMinutes * 60000).toISOString(), reminderMinutes: [...new Set(reminderMinutes)].sort((a, b) => a - b) };
}

export function integrationWithCapability(integrations: BackendIntegration[], providerId: string, capability: IntegrationCapability) {
  const integration = integrations.find((item) => item.providerId === providerId);
  const port = capability === "calendar" ? integration?.calendar : capability === "documents" ? integration?.documents : integration?.directory;
  if (!integration || !port) throw new Error("Ce connecteur n’est pas configuré. Aucun compte ni envoi externe n’a été activé.");
  return integration;
}
