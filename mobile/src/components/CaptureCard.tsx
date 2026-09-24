import { Image, StyleSheet, Text, View } from 'react-native';

import { Capture, SyncStatus } from '../types';

const statusLabels: Record<SyncStatus, string> = {
  local: 'Enregistrée localement',
  waiting: 'En attente réseau',
  uploading: 'Transfert en cours',
  synced: 'Synchronisée',
  error: 'Erreur de transfert'
};

const statusColors: Record<SyncStatus, string> = {
  local: '#8A5A00',
  waiting: '#8A5A00',
  uploading: '#1466B8',
  synced: '#187A4A',
  error: '#B42318'
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDuration(durationMs?: number): string {
  if (!durationMs) return 'Note vocale';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function CaptureCard({ capture }: { capture: Capture }) {
  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Text style={styles.time}>{formatTime(capture.createdAt)}</Text>
        <Text style={[styles.status, { color: statusColors[capture.syncStatus] }]}>
          {statusLabels[capture.syncStatus]}
        </Text>
      </View>

      {capture.text ? <Text style={styles.message}>{capture.text}</Text> : null}

      {capture.audioUri ? (
        <View style={styles.audioPill}>
          <Text style={styles.audioIcon}>●</Text>
          <Text style={styles.audioText}>Note vocale · {formatDuration(capture.audioDurationMs)}</Text>
        </View>
      ) : null}

      {capture.photoUris.length ? (
        <View style={styles.photoRow}>
          {capture.photoUris.slice(0, 3).map((uri, index) => (
            <Image key={`${uri}-${index}`} source={{ uri }} style={styles.photo} />
          ))}
          {capture.photoUris.length > 3 ? (
            <View style={[styles.photo, styles.morePhotos]}>
              <Text style={styles.morePhotosText}>+{capture.photoUris.length - 3}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE5E1',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  time: { color: '#64736D', fontSize: 12, fontWeight: '600' },
  status: { fontSize: 12, fontWeight: '700' },
  message: { color: '#14231E', fontSize: 16, lineHeight: 23 },
  audioPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E9F4EF',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  audioIcon: { color: '#C9483E', fontSize: 12 },
  audioText: { color: '#195A43', fontSize: 13, fontWeight: '700' },
  photoRow: { flexDirection: 'row', gap: 8 },
  photo: { borderRadius: 10, height: 74, width: 74 },
  morePhotos: {
    alignItems: 'center',
    backgroundColor: '#E9EFEC',
    justifyContent: 'center'
  },
  morePhotosText: { color: '#42544D', fontSize: 16, fontWeight: '800' }
});
