import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { demoVisit } from './demo';
import { loadVisit, saveVisit } from './storage';
import { Capture, VisitState, ZoneStatus } from './types';

const delay = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export function useVisitStore() {
  const [visit, setVisit] = useState<VisitState>(demoVisit);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    let active = true;
    loadVisit()
      .then((storedVisit) => {
        if (active && storedVisit) setVisit(storedVisit);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (ready) void saveVisit(visit);
  }, [ready, visit]);

  const currentZoneIndex = Math.max(
    0,
    visit.zones.findIndex((zone) => zone.id === visit.currentZoneId)
  );
  const currentZone = visit.zones[currentZoneIndex] ?? visit.zones[0];

  const setCurrentZone = useCallback((zoneId: string) => {
    setVisit((previous) => ({ ...previous, currentZoneId: zoneId }));
  }, []);

  const moveZone = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = Math.min(
        visit.zones.length - 1,
        Math.max(0, currentZoneIndex + direction)
      );
      const nextZone = visit.zones[nextIndex];
      if (nextZone) setCurrentZone(nextZone.id);
    },
    [currentZoneIndex, setCurrentZone, visit.zones]
  );

  const setZoneStatus = useCallback((zoneId: string, status: ZoneStatus) => {
    setVisit((previous) => ({
      ...previous,
      zones: previous.zones.map((zone) => (zone.id === zoneId ? { ...zone, status } : zone))
    }));
  }, []);

  const addCapture = useCallback((capture: Capture) => {
    setVisit((previous) => ({
      ...previous,
      captures: [...previous.captures, capture],
      zones: previous.zones.map((zone) =>
        zone.id === capture.zoneId ? { ...zone, status: 'visited' } : zone
      )
    }));
  }, []);

  const syncPending = useCallback(async () => {
    if (!online || syncingRef.current) return;
    syncingRef.current = true;
    const pendingIds = visit.captures
      .filter((capture) => capture.syncStatus !== 'synced')
      .map((capture) => capture.id);

    for (const captureId of pendingIds) {
      setVisit((previous) => ({
        ...previous,
        captures: previous.captures.map((capture) =>
          capture.id === captureId ? { ...capture, syncStatus: 'uploading' } : capture
        )
      }));
      await delay(650);
      setVisit((previous) => ({
        ...previous,
        captures: previous.captures.map((capture) =>
          capture.id === captureId ? { ...capture, syncStatus: 'synced' } : capture
        )
      }));
    }
    syncingRef.current = false;
  }, [online, visit.captures]);

  useEffect(() => {
    if (online) void syncPending();
  }, [online, syncPending]);

  const capturesForCurrentZone = useMemo(
    () => visit.captures.filter((capture) => capture.zoneId === currentZone?.id),
    [currentZone?.id, visit.captures]
  );

  const pendingCount = visit.captures.filter((capture) => capture.syncStatus !== 'synced').length;
  const remainingCount = visit.zones.filter((zone) => zone.status === 'remaining').length;

  const closeVisit = useCallback(() => {
    setVisit((previous) => ({ ...previous, closedAt: new Date().toISOString() }));
  }, []);

  return {
    visit,
    ready,
    online,
    setOnline,
    currentZone,
    currentZoneIndex,
    capturesForCurrentZone,
    pendingCount,
    remainingCount,
    setCurrentZone,
    moveZone,
    setZoneStatus,
    addCapture,
    syncPending,
    closeVisit
  };
}
