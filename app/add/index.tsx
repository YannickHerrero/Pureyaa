import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { AnkiBridge } from 'anki-bridge';
import { extractAudio } from 'audio-extract';
import { detectFromFilename, titleFromFilename } from '@/utils/filenameDetect';
import { getOpenRouterApiKey } from '@/storage/settings';
import { audioFormatForFilename, transcribeToSrt } from '@/openrouter/transcribe';
import { uuid } from '@/utils/uuid';

interface PickedFile {
  uri: string;
  name: string;
  size?: number;
}

export default function AddScreen() {
  const router = useRouter();
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [subtitle, setSubtitle] = useState<PickedFile | null>(null);
  const [seriesName, setSeriesName] = useState<string>('');
  const [episodeStr, setEpisodeStr] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [noSeries, setNoSeries] = useState<boolean>(false);
  const [picking, setPicking] = useState<'video' | 'srt' | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [generating, setGenerating] = useState<'extracting' | 'transcribing' | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const k = await getOpenRouterApiKey();
      setHasApiKey(!!k && k.trim().length > 0);
    })();
  }, []);

  const pickVideo = async () => {
    setPicking('video');
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: false,
      });
      if (r.canceled) return;
      const asset = r.assets[0];
      // Take persistent permission so the URI keeps working after restart.
      await AnkiBridge.persistUriPermission(asset.uri);
      const f: PickedFile = { uri: asset.uri, name: asset.name, size: asset.size };
      setVideo(f);
      const det = detectFromFilename(asset.name);
      if (det.seriesName) setSeriesName(det.seriesName);
      if (det.episodeNumber != null) setEpisodeStr(String(det.episodeNumber));
      setTitle(titleFromFilename(asset.name));
    } finally {
      setPicking(null);
    }
  };

  const pickSubtitle = async () => {
    setPicking('srt');
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['application/x-subrip', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const asset = r.assets[0];
      setSubtitle({ uri: asset.uri, name: asset.name, size: asset.size });
    } finally {
      setPicking(null);
    }
  };

  const generateSubtitle = async () => {
    if (!video || generating) return;
    setGenerateError(null);
    setGenerating('extracting');
    let audioPath: string | null = null;
    try {
      const apiKey = await getOpenRouterApiKey();
      if (!apiKey) {
        throw new Error('Set your OpenRouter API key in Settings first.');
      }

      const id = uuid().replace(/-/g, '').slice(0, 12);
      const audioDir = new Directory(Paths.cache, 'whisper-audio');
      if (!audioDir.exists) audioDir.create({ intermediates: true });
      const audioRequested = new File(audioDir, `audio_${id}.m4a`).uri;

      // Extract the full audio track. endMs is generous on purpose — the
      // Kotlin extractor stops naturally at EOS (sampleData < 0) regardless.
      audioPath = await extractAudio(video.uri, {
        startMs: 0,
        endMs: 2_000_000_000,
        outPath: audioRequested,
      });

      setGenerating('transcribing');
      const audioFilename = audioPath.split('/').pop() ?? 'audio.m4a';
      const srt = await transcribeToSrt({
        apiKey,
        audioUri: audioPath,
        audioFormat: audioFormatForFilename(audioFilename),
      });

      const subDir = new Directory(Paths.cache, 'whisper-subs');
      if (!subDir.exists) subDir.create({ intermediates: true });
      const baseName = (title.trim() || video.name.replace(/\.[^.]+$/, '')) || 'whisper';
      const subFilename = `${baseName}.whisper.srt`;
      const subFile = new File(subDir, subFilename);
      if (subFile.exists) subFile.delete();
      subFile.write(srt);

      setSubtitle({ uri: subFile.uri, name: subFilename, size: srt.length });
    } catch (e) {
      setGenerateError((e as Error).message);
    } finally {
      setGenerating(null);
      // Best-effort cleanup of the temp audio file. Cache is OS-evictable
      // anyway, so failures don't matter.
      if (audioPath) {
        try {
          const af = new File(audioPath);
          if (af.exists) af.delete();
        } catch {
          // ignore
        }
      }
    }
  };

  const onConfirm = () => {
    if (!video || !subtitle || !title.trim() || !hasApiKey) return;
    const params = {
      videoUri: video.uri,
      videoName: video.name,
      subtitleUri: subtitle.uri,
      subtitleName: subtitle.name,
      title: title.trim(),
      seriesName: noSeries ? '' : seriesName.trim(),
      episodeNumber: noSeries ? '' : episodeStr.trim(),
    };
    router.push({ pathname: '/add/analyze', params });
  };

  const ready = video && subtitle && title.trim().length > 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Add to library', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Step
          n={1}
          title="Pick video"
          status={video ? video.name : picking === 'video' ? 'Picking…' : 'Not selected'}
          onPress={pickVideo}
          disabled={picking !== null}
        />
        <Step
          n={2}
          title="Pick .srt subtitle"
          status={subtitle ? subtitle.name : picking === 'srt' ? 'Picking…' : 'Not selected'}
          onPress={pickSubtitle}
          disabled={picking !== null || !video || generating !== null}
        />

        {video && !subtitle && (
          <Pressable
            style={[styles.altAction, generating !== null && styles.altActionBusy]}
            onPress={generateSubtitle}
            disabled={generating !== null || !hasApiKey}
          >
            {generating ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.altActionText}>
                  {generating === 'extracting' ? 'Extracting audio…' : 'Transcribing with Whisper…'}
                </Text>
              </>
            ) : (
              <Text style={styles.altActionText}>
                or generate subtitle with Whisper
                {!hasApiKey ? ' (set API key first)' : ''}
              </Text>
            )}
          </Pressable>
        )}
        {generateError && (
          <Text style={styles.warning}>Whisper: {generateError}</Text>
        )}

        {video && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm details</Text>

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={styles.input}
              placeholder="Episode title"
              placeholderTextColor="#666"
            />

            <View style={styles.toggleRow}>
              <Pressable onPress={() => setNoSeries(!noSeries)} style={styles.checkbox}>
                <View style={[styles.checkboxBox, noSeries && styles.checkboxBoxOn]} />
                <Text style={styles.checkboxLabel}>No series (standalone)</Text>
              </Pressable>
            </View>

            {!noSeries && (
              <>
                <Text style={styles.label}>Series name</Text>
                <TextInput
                  value={seriesName}
                  onChangeText={setSeriesName}
                  style={styles.input}
                  placeholder="Detected from filename"
                  placeholderTextColor="#666"
                />
                <Text style={styles.label}>Episode number</Text>
                <TextInput
                  value={episodeStr}
                  onChangeText={setEpisodeStr}
                  keyboardType="number-pad"
                  style={styles.input}
                  placeholder="Detected from filename"
                  placeholderTextColor="#666"
                />
              </>
            )}
          </View>
        )}

        {!hasApiKey && (
          <Text style={styles.warning}>
            Set your API key in Settings →
          </Text>
        )}

        <Pressable
          style={[styles.confirm, (!ready || !hasApiKey) && styles.confirmDisabled]}
          disabled={!ready || !hasApiKey}
          onPress={onConfirm}
        >
          <Text style={styles.confirmText}>Start analysis</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Step({
  n,
  title,
  status,
  onPress,
  disabled,
}: {
  n: number;
  title: string;
  status: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.step, disabled && styles.stepDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.stepN}>{n}</Text>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepStatus} numberOfLines={1}>{status}</Text>
      </View>
      {disabled && <ActivityIndicator color="#666" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, gap: 16 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#181818',
    borderRadius: 8,
  },
  stepDisabled: { opacity: 0.5 },
  stepN: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    width: 24,
    textAlign: 'center',
  },
  stepBody: { flex: 1 },
  stepTitle: { color: '#fff', fontSize: 16 },
  stepStatus: { color: '#888', fontSize: 13, marginTop: 2 },
  section: { gap: 8, marginTop: 8 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 4 },
  label: { color: '#aaa', fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: '#181818',
    color: '#fff',
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
  },
  toggleRow: { flexDirection: 'row', marginTop: 12 },
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderColor: '#666',
    borderWidth: 1,
  },
  checkboxBoxOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkboxLabel: { color: '#fff' },
  warning: { color: '#f59e0b', fontSize: 14, textAlign: 'center', marginTop: 8 },
  altAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0f1f3a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e3a8a',
  },
  altActionBusy: { opacity: 0.8 },
  altActionText: { color: '#dbeafe', fontSize: 14, fontWeight: '500' },
  confirm: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmDisabled: { backgroundColor: '#333' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
