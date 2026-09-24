import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { CaptureCard } from './src/components/CaptureCard';
import { Composer } from './src/components/Composer';
import { Zone, ZoneStatus } from './src/types';
import { useVisitStore } from './src/useVisitStore';

const zoneStatusLabels: Record<ZoneStatus, string> = {
  remaining: 'À visiter',
  visited: 'Observation',
  clear: 'RAS',
  unavailable: 'Non accessible'
};

function ZonePill({ zone, active, onPress }: { zone: Zone; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.zonePill, active && styles.zonePillActive]}>
      <Text style={[styles.zonePillTitle, active && styles.zonePillTitleActive]}>{zone.name}</Text>
      <Text style={[styles.zonePillStatus, active && styles.zonePillStatusActive]}>
        {zoneStatusLabels[zone.status]}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const store = useVisitStore();

  if (!store.ready || !store.currentZone) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#176A4D" size="large" />
        <Text style={styles.loadingText}>Ouverture de la visite…</Text>
      </SafeAreaView>
    );
  }

  const closeVisit = () => {
    Alert.alert(
      'Clôturer la visite ?',
      `${store.remainingCount} zone(s) restent à qualifier et ${store.pendingCount} capture(s) attendent une synchronisation.`,
      [
        { text: 'Continuer la visite', style: 'cancel' },
        { text: 'Clôturer localement', onPress: store.closeVisit }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>VISTA</Text>
          <Text style={styles.property}>{store.visit.propertyName}</Text>
        </View>
        <Pressable
          onPress={() => store.setOnline((value) => !value)}
          style={[styles.networkBadge, store.online && styles.networkBadgeOnline]}
        >
          <Text style={[styles.networkText, store.online && styles.networkTextOnline]}>
            {store.online ? '● En ligne' : '● Hors ligne'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.progressCard}>
          <View style={styles.progressMeta}>
            <Text style={styles.progressEyebrow}>PARCOURS DE VISITE</Text>
            <Text style={styles.progressCount}>
              {store.currentZoneIndex + 1}/{store.visit.zones.length}
            </Text>
          </View>
          <Text style={styles.zoneTitle}>{store.currentZone.name}</Text>
          <Text style={styles.zoneDetail}>{store.currentZone.detail}</Text>
          <View style={styles.zoneActions}>
            <Pressable
              onPress={() => store.setZoneStatus(store.currentZone!.id, 'clear')}
              style={styles.outlineButton}
            >
              <Text style={styles.outlineButtonText}>Marquer RAS</Text>
            </Pressable>
            <Pressable
              onPress={() => store.setZoneStatus(store.currentZone!.id, 'unavailable')}
              style={styles.outlineButton}
            >
              <Text style={styles.outlineButtonText}>Non accessible</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneRow}>
          {store.visit.zones.map((zone) => (
            <ZonePill
              active={zone.id === store.currentZone?.id}
              key={zone.id}
              onPress={() => store.setCurrentZone(zone.id)}
              zone={zone}
            />
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Observations</Text>
            <Text style={styles.sectionSubtitle}>Texte, voix et photos restent liés à cette zone.</Text>
          </View>
          {store.pendingCount ? (
            <Text style={styles.pendingBadge}>{store.pendingCount} en attente</Text>
          ) : null}
        </View>

        <View style={styles.captureList}>
          {store.capturesForCurrentZone.length ? (
            store.capturesForCurrentZone.map((capture) => (
              <CaptureCard capture={capture} key={capture.id} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>◎</Text>
              <Text style={styles.emptyTitle}>Aucune observation</Text>
              <Text style={styles.emptyText}>Écrivez, dictez ou ajoutez une photo pour commencer.</Text>
            </View>
          )}
        </View>

        <Composer
          onSubmit={store.addCapture}
          online={store.online}
          zoneId={store.currentZone.id}
        />

        <View style={styles.navigationRow}>
          <Pressable
            disabled={store.currentZoneIndex === 0}
            onPress={() => store.moveZone(-1)}
            style={[styles.navigationButton, store.currentZoneIndex === 0 && styles.disabledButton]}
          >
            <Text style={styles.navigationButtonText}>← Précédent</Text>
          </Pressable>
          {store.currentZoneIndex === store.visit.zones.length - 1 ? (
            <Pressable onPress={closeVisit} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Clôturer</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => store.moveZone(1)} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>Zone suivante →</Text>
            </Pressable>
          )}
        </View>

        {store.visit.closedAt ? (
          <View style={styles.closedBanner}>
            <Text style={styles.closedTitle}>Visite clôturée localement</Text>
            <Text style={styles.closedText}>
              Le compte rendu sera disponible après synchronisation et traitement.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F3F6F4', flex: 1 },
  loading: { alignItems: 'center', backgroundColor: '#F3F6F4', flex: 1, gap: 14, justifyContent: 'center' },
  loadingText: { color: '#52615B', fontSize: 14, fontWeight: '600' },
  topBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#DDE5E1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  brand: { color: '#176A4D', fontSize: 21, fontWeight: '900', letterSpacing: 1.2 },
  property: { color: '#53615C', fontSize: 12, fontWeight: '600', marginTop: 1 },
  networkBadge: { backgroundColor: '#FFF2D6', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  networkBadgeOnline: { backgroundColor: '#E2F3EA' },
  networkText: { color: '#8A5A00', fontSize: 12, fontWeight: '800' },
  networkTextOnline: { color: '#187A4A' },
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  progressCard: { backgroundColor: '#143F31', borderRadius: 22, padding: 18 },
  progressMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressEyebrow: { color: '#A8C9BC', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  progressCount: { color: '#DCEAE4', fontSize: 12, fontWeight: '800' },
  zoneTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 12 },
  zoneDetail: { color: '#C0D5CC', fontSize: 14, marginTop: 4 },
  zoneActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  outlineButton: { borderColor: '#4F7667', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  outlineButtonText: { color: '#E5F1EC', fontSize: 12, fontWeight: '700' },
  zoneRow: { gap: 8 },
  zonePill: { backgroundColor: '#E3EAE7', borderRadius: 14, minWidth: 116, paddingHorizontal: 12, paddingVertical: 10 },
  zonePillActive: { backgroundColor: '#176A4D' },
  zonePillTitle: { color: '#273A33', fontSize: 13, fontWeight: '800' },
  zonePillTitleActive: { color: '#FFFFFF' },
  zonePillStatus: { color: '#6C7A75', fontSize: 10, marginTop: 3 },
  zonePillStatusActive: { color: '#C8E1D7' },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: '#14231E', fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: '#697771', fontSize: 12, marginTop: 3, maxWidth: 250 },
  pendingBadge: { backgroundColor: '#FFF0CF', borderRadius: 10, color: '#815500', fontSize: 11, fontWeight: '800', overflow: 'hidden', padding: 7 },
  captureList: { gap: 10 },
  emptyState: { alignItems: 'center', backgroundColor: '#E8EEEB', borderRadius: 18, padding: 22 },
  emptyIcon: { color: '#729083', fontSize: 28 },
  emptyTitle: { color: '#2D4139', fontSize: 15, fontWeight: '800', marginTop: 4 },
  emptyText: { color: '#6A7973', fontSize: 12, marginTop: 3, textAlign: 'center' },
  navigationRow: { flexDirection: 'row', gap: 10 },
  navigationButton: { backgroundColor: '#E2E9E6', borderRadius: 14, flex: 1, padding: 14 },
  navigationButtonText: { color: '#30443C', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disabledButton: { opacity: 0.4 },
  nextButton: { backgroundColor: '#176A4D', borderRadius: 14, flex: 1.3, padding: 14 },
  nextButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  closeButton: { backgroundColor: '#18362C', borderRadius: 14, flex: 1.3, padding: 14 },
  closeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  closedBanner: { backgroundColor: '#DDEFE7', borderRadius: 16, padding: 15 },
  closedTitle: { color: '#176A4D', fontSize: 14, fontWeight: '900' },
  closedText: { color: '#3F5A50', fontSize: 12, marginTop: 3 }
});
