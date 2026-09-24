import { VisitState } from './types';

export const demoVisit: VisitState = {
  id: 'visit-demo-001',
  propertyName: 'Résidence du Parc',
  currentZoneId: 'zone-terrace',
  zones: [
    { id: 'zone-terrace', name: 'Toit-terrasse', detail: 'Accès et équipements', order: 1, status: 'remaining' },
    { id: 'zone-6', name: '6e étage', detail: 'Palier et cage A', order: 2, status: 'remaining' },
    { id: 'zone-5', name: '5e étage', detail: 'Palier et cage A', order: 3, status: 'remaining' },
    { id: 'zone-4', name: '4e étage', detail: 'Palier et cage A', order: 4, status: 'remaining' },
    { id: 'zone-3', name: '3e étage', detail: 'Palier et cage A', order: 5, status: 'remaining' },
    { id: 'zone-2', name: '2e étage', detail: 'Palier et cage A', order: 6, status: 'remaining' },
    { id: 'zone-1', name: '1er étage', detail: 'Palier et cage A', order: 7, status: 'remaining' },
    { id: 'zone-ground', name: 'Rez-de-chaussée', detail: 'Hall, boîtes aux lettres et accès', order: 8, status: 'remaining' },
    { id: 'zone-basement', name: 'Sous-sol', detail: 'Caves et locaux communs', order: 9, status: 'remaining' },
    { id: 'zone-parking', name: 'Parking', detail: 'Sas, circulations et places', order: 10, status: 'remaining' }
  ],
  captures: []
};
