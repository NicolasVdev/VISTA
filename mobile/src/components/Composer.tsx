import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';

import { persistMedia } from '../storage';
import { Capture } from '../types';

type ComposerProps = {
  zoneId: string;
  online: boolean;
  onSubmit: (capture: Capture) => void;
};

export function Composer({ zoneId, online, onSubmit }: ComposerProps) {
  const [text, setText] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [audioUri, setAudioUri] = useState<string>();
  const [audioDurationMs, setAudioDurationMs] = useState<number>();
  const [busy, setBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const addPhotoUris = async (uris: string[]) => {
    setBusy(true);
    try {
      const persisted = await Promise.all(uris.map((uri) => persistMedia(uri, 'photo')));
      setPhotoUris((current) => [...current, ...persisted]);
    } catch {
      Alert.alert('Photo non enregistrée', "VISTA n'a pas pu conserver cette photo localement.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Autorisation nécessaire', "L'accès à l'appareil photo est nécessaire.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75
    });
    if (!result.canceled) await addPhotoUris(result.assets.map((asset) => asset.uri));
  };

  const choosePhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.75,
      selectionLimit: 8
    });
    if (!result.canceled) await addPhotoUris(result.assets.map((asset) => asset.uri));
  };

  const showPhotoOptions = () => {
    Alert.alert('Ajouter des photos', undefined, [
      { text: 'Prendre une photo', onPress: () => void takePhoto() },
      { text: 'Choisir dans la photothèque', onPress: () => void choosePhotos() },
      { text: 'Annuler', style: 'cancel' }
    ]);
  };

  const startRecording = async () => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Autorisation nécessaire', "L'accès au microphone est nécessaire.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopRecording = async () => {
    setBusy(true);
    try {
      const duration = recorderState.durationMillis;
      await recorder.stop();
      if (recorder.uri) {
        const persisted = await persistMedia(recorder.uri, 'audio');
        setAudioUri(persisted);
        setAudioDurationMs(duration);
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      Alert.alert('Enregistrement interrompu', "La note vocale n'a pas pu être conservée.");
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!text.trim() && !audioUri && photoUris.length === 0) {
      Alert.alert('Observation vide', 'Ajoutez un texte, une note vocale ou une photo.');
      return;
    }
    const id = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onSubmit({
      id,
      zoneId,
      createdAt: new Date().toISOString(),
      text: text.trim(),
      audioUri,
      audioDurationMs,
      photoUris,
      syncStatus: online ? 'waiting' : 'local'
    });
    setText('');
    setAudioUri(undefined);
    setAudioDurationMs(undefined);
    setPhotoUris([]);
  };

  return (
    <View style={styles.wrapper}>
      {photoUris.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
          {photoUris.map((uri, index) => (
            <Pressable
              key={`${uri}-${index}`}
              onPress={() => setPhotoUris((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Image source={{ uri }} style={styles.preview} />
              <View style={styles.removeBadge}>
                <Text style={styles.removeText}>×</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {audioUri ? (
        <Pressable style={styles.audioReady} onPress={() => setAudioUri(undefined)}>
          <Text style={styles.audioReadyText}>● Note vocale prête · toucher pour retirer</Text>
        </Pressable>
      ) : null}

      <TextInput
        multiline
        onChangeText={setText}
        placeholder="Écrire une observation…"
        placeholderTextColor="#84928D"
        style={styles.input}
        value={text}
      />

      <View style={styles.actions}>
        <Pressable disabled={busy} onPress={showPhotoOptions} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>＋ Photos</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={recorderState.isRecording ? () => void stopRecording() : () => void startRecording()}
          style={[styles.micButton, recorderState.isRecording && styles.micButtonActive]}
        >
          <Text style={styles.micButtonText}>{recorderState.isRecording ? '■ Stop' : '● Vocal'}</Text>
        </Pressable>
        <Pressable disabled={busy || recorderState.isRecording} onPress={submit} style={styles.sendButton}>
          <Text style={styles.sendButtonText}>Enregistrer</Text>
        </Pressable>
      </View>
      <Text style={styles.localHint}>Enregistré d'abord sur ce téléphone</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CFDBD6',
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  input: {
    color: '#14231E',
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    minHeight: 54,
    paddingHorizontal: 4,
    paddingVertical: 6,
    textAlignVertical: 'top'
  },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  secondaryButton: {
    backgroundColor: '#EDF2F0',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 11
  },
  secondaryButtonText: { color: '#2B4038', fontSize: 13, fontWeight: '800' },
  micButton: {
    backgroundColor: '#F7E9E7',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 11
  },
  micButtonActive: { backgroundColor: '#C9483E' },
  micButtonText: { color: '#8D3029', fontSize: 13, fontWeight: '800' },
  sendButton: {
    backgroundColor: '#176A4D',
    borderRadius: 12,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  sendButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  localHint: { color: '#74817C', fontSize: 11, textAlign: 'center' },
  previewRow: { gap: 8 },
  preview: { borderRadius: 10, height: 64, width: 64 },
  removeBadge: {
    alignItems: 'center',
    backgroundColor: '#14231E',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    top: -4,
    width: 20
  },
  removeText: { color: '#FFFFFF', fontSize: 15, lineHeight: 17 },
  audioReady: { backgroundColor: '#E9F4EF', borderRadius: 12, padding: 10 },
  audioReadyText: { color: '#195A43', fontSize: 12, fontWeight: '700' }
});
