import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { AnkiSettings, AppSettings, AudioMode, SubtitleMode } from '@/types';
import { DEFAULT_ANKI_SETTINGS, DEFAULT_SETTINGS, TTS_VOICES } from '@/types';
import {
  getSettings,
  saveSettings,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  clearOpenRouterApiKey,
  getWanikaniApiKey,
  setWanikaniApiKey,
  clearWanikaniApiKey,
} from '@/storage/settings';
import { getAnkiSettings, saveAnkiSettings } from '@/storage/ankiSettings';
import { testOpenRouterApiKey } from '@/openrouter/client';
import { AnkiClient } from '@/anki/client';
import { synthesizeJapanese } from '@/anki/tts';
import { fetchAllWanikaniKanji, testWanikaniApiKey } from '@/wanikani/api';
import { ANKI_AVAILABLE } from '@/featureFlags';
import {
  clearKanjiCache,
  getKanjiCacheStats,
  saveKanjiCache,
  type KanjiCacheStats,
} from '@/wanikani/cache';

const VOICE_PREVIEW_TEXT = '今日はいい天気ですね。';

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const SUB_MODES: SubtitleMode[] = ['jp', 'jp+en', 'en'];

const MODE_LABELS: Record<SubtitleMode, string> = {
  jp: 'JP only',
  'jp+en': 'JP + EN',
  en: 'EN only',
};

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [anki, setAnki] = useState<AnkiSettings>(DEFAULT_ANKI_SETTINGS);
  const [apiKey, setApiKeyState] = useState<string>('');
  const [keyDirty, setKeyDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [previewLoadingVoice, setPreviewLoadingVoice] = useState<string | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const previewPlayer = useVideoPlayer(previewUri, (p) => {
    p.loop = false;
    p.muted = false;
  });
  const [wkKey, setWkKey] = useState<string>('');
  const [wkSyncing, setWkSyncing] = useState(false);
  const [wkProgress, setWkProgress] = useState<{ done: number; total: number } | null>(null);
  const [wkResult, setWkResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [wkStats, setWkStats] = useState<KanjiCacheStats | null>(null);

  useEffect(() => {
    (async () => {
      const [s, a, k, w, ws] = await Promise.all([
        getSettings(),
        getAnkiSettings(),
        getOpenRouterApiKey(),
        getWanikaniApiKey(),
        getKanjiCacheStats(),
      ]);
      setSettings(s);
      setAnki(a);
      setApiKeyState(k ?? '');
      setWkKey(w ?? '');
      setWkStats(ws);
      setLoaded(true);
    })();
  }, []);

  const onSaveKey = async () => {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      await clearOpenRouterApiKey();
    } else {
      await setOpenRouterApiKey(trimmed);
    }
    setKeyDirty(false);
    setTestResult(null);
  };

  const onTest = async () => {
    if (!loaded || apiKey.trim().length === 0) return;
    setTesting(true);
    setTestResult(null);
    try {
      const trimmed = apiKey.trim();
      if (keyDirty) await setOpenRouterApiKey(trimmed);
      const info = await testOpenRouterApiKey(trimmed);
      setKeyDirty(false);
      setTestResult({
        ok: true,
        message: `Connected as "${info.label}" — used $${info.usage.toFixed(2)}` +
          (info.limit != null ? ` of $${info.limit.toFixed(2)}` : ''),
      });
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const playVoicePreview = async (voiceId: string) => {
    const key = apiKey.trim();
    if (!key) return; // need a key to synthesize

    let uri = previewCacheRef.current.get(voiceId);
    if (!uri) {
      setPreviewLoadingVoice(voiceId);
      try {
        const tts = await synthesizeJapanese({
          text: VOICE_PREVIEW_TEXT,
          voiceName: voiceId,
          apiKey: key,
          outputId: `preview_${voiceId}`,
        });
        const cacheDir = new Directory(Paths.cache, 'tts-preview');
        if (!cacheDir.exists) cacheDir.create({ intermediates: true });
        const file = new File(cacheDir, tts.filename);
        if (file.exists) file.delete();
        file.write(base64ToBytes(tts.base64));
        uri = file.uri;
        previewCacheRef.current.set(voiceId, uri);
      } catch (e) {
        setTestResult({ ok: false, message: (e as Error).message });
        return;
      } finally {
        setPreviewLoadingVoice(null);
      }
    }

    try {
      previewPlayer.pause();
      previewPlayer.replace({ uri });
      previewPlayer.currentTime = 0;
      previewPlayer.play();
    } catch {
      // ignore — playback errors don't need to be surfaced
    }
  };

  const updateAnki = async (patch: Partial<AnkiSettings>) => {
    const next = { ...anki, ...patch };
    setAnki(next);
    await saveAnkiSettings(next);
  };

  const onSyncWanikani = async () => {
    const trimmed = wkKey.trim();
    if (trimmed.length === 0) {
      await clearWanikaniApiKey();
      await clearKanjiCache();
      setWkStats(null);
      setWkResult({ ok: true, message: 'WaniKani disconnected.' });
      return;
    }
    setWkSyncing(true);
    setWkResult(null);
    setWkProgress(null);
    try {
      const user = await testWanikaniApiKey(trimmed);
      await setWanikaniApiKey(trimmed);
      const byChar = await fetchAllWanikaniKanji(trimmed, (done, total) => {
        setWkProgress({ done, total });
      });
      await saveKanjiCache(byChar);
      const stats = await getKanjiCacheStats();
      setWkStats(stats);
      setWkResult({
        ok: true,
        message: `${user.username} (level ${user.level}) — ${stats?.count ?? 0} kanji cached.`,
      });
    } catch (e) {
      setWkResult({ ok: false, message: (e as Error).message });
    } finally {
      setWkSyncing(false);
      setWkProgress(null);
    }
  };

  const [ankiTesting, setAnkiTesting] = useState(false);
  const [ankiResult, setAnkiResult] = useState<{ ok: boolean; message: string } | null>(null);
  const onConnectAnki = async () => {
    setAnkiTesting(true);
    setAnkiResult(null);
    try {
      if (!AnkiClient.isAvailable()) {
        setAnkiResult({
          ok: false,
          message: 'AnkiDroid is not installed. Install it from the Play Store first.',
        });
        return;
      }
      let granted = await AnkiClient.hasPermission();
      if (!granted) {
        granted = await AnkiClient.requestPermission();
      }
      if (!granted) {
        setAnkiResult({
          ok: false,
          message: 'Permission denied. Tap Connect again and accept the prompt.',
        });
        return;
      }
      // Install the custom note type and ensure the deck (idempotent).
      await AnkiClient.ensurePureyaaModel();
      await AnkiClient.ensureDeck(anki.defaultDeckName);
      setAnkiResult({
        ok: true,
        message: `Connected. Deck "${anki.defaultDeckName}" + Pureyaa Sentence model ready.`,
      });
    } catch (e) {
      setAnkiResult({ ok: false, message: (e as Error).message });
    } finally {
      setAnkiTesting(false);
    }
  };

  const update = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="OpenRouter API key">
        <Label>One key for analysis (Claude), TTS (OpenAI), and Whisper</Label>
        <TextInput
          value={apiKey}
          onChangeText={(t) => {
            setApiKeyState(t);
            setKeyDirty(true);
          }}
          placeholder="sk-or-v1-..."
          placeholderTextColor="#666"
          secureTextEntry
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.button, !keyDirty && styles.buttonDisabled]}
            disabled={!keyDirty}
            onPress={onSaveKey}
          >
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
          <Pressable
            style={[styles.button, (testing || apiKey.trim().length === 0) && styles.buttonDisabled]}
            disabled={testing || apiKey.trim().length === 0}
            onPress={onTest}
          >
            <Text style={styles.buttonText}>{testing ? 'Testing…' : 'Test connection'}</Text>
          </Pressable>
        </View>
        {testResult && (
          <Text style={[styles.testResult, testResult.ok ? styles.ok : styles.bad]}>
            {testResult.ok ? '✓ ' : '✗ '}
            {testResult.message}
          </Text>
        )}
      </Section>

      {ANKI_AVAILABLE && (
        <Section title="Anki">
          <Label>Audio source</Label>
        <View style={styles.choiceRow}>
          {(['original', 'tts', 'none'] as AudioMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.choice, anki.audioMode === m && styles.choiceActive]}
              onPress={() => updateAnki({ audioMode: m })}
            >
              <Text style={styles.choiceText}>
                {m === 'original' ? 'Original' : m === 'tts' ? 'TTS' : 'None'}
              </Text>
            </Pressable>
          ))}
        </View>

        {anki.audioMode === 'tts' && (
          <View style={styles.ttsBlock}>
            <Label>TTS voice (tap to preview)</Label>
            <View style={styles.choiceRow}>
              {TTS_VOICES.map((v) => (
                <Pressable
                  key={v.id}
                  style={[styles.choice, anki.ttsVoice === v.id && styles.choiceActive]}
                  onPress={async () => {
                    await updateAnki({ ttsVoice: v.id });
                    await playVoicePreview(v.id);
                  }}
                >
                  <View style={styles.choiceInner}>
                    <Text style={styles.choiceText}>{v.label}</Text>
                    {previewLoadingVoice === v.id && (
                      <ActivityIndicator color="#fff" size="small" />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
            {/* Hidden VideoView is needed so the player can drive audio output */}
            <VideoView player={previewPlayer} style={styles.hiddenPlayer} contentFit="contain" />
          </View>
        )}

        <Label>Default deck</Label>
        <TextInput
          value={anki.defaultDeckName}
          onChangeText={(t) => updateAnki({ defaultDeckName: t })}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label>Audio padding before (ms)</Label>
        <TextInput
          value={String(anki.audioPaddingBeforeMs)}
          onChangeText={(t) => updateAnki({ audioPaddingBeforeMs: parsePositiveInt(t) })}
          style={styles.input}
          keyboardType="number-pad"
        />

        <Label>Audio padding after (ms)</Label>
        <TextInput
          value={String(anki.audioPaddingAfterMs)}
          onChangeText={(t) => updateAnki({ audioPaddingAfterMs: parsePositiveInt(t) })}
          style={styles.input}
          keyboardType="number-pad"
        />

        <View style={styles.row}>
          <Pressable
            style={[styles.button, ankiTesting && styles.buttonDisabled]}
            disabled={ankiTesting}
            onPress={onConnectAnki}
          >
            <Text style={styles.buttonText}>
              {ankiTesting ? 'Connecting…' : 'Connect AnkiDroid'}
            </Text>
          </Pressable>
        </View>
        {ankiResult && (
          <Text style={[styles.testResult, ankiResult.ok ? styles.ok : styles.bad]}>
            {ankiResult.ok ? '✓ ' : '✗ '}
            {ankiResult.message}
          </Text>
        )}
        </Section>
      )}

      <Section title="WaniKani (kanji info on cards)">
        <Label>Personal access token</Label>
        <TextInput
          value={wkKey}
          onChangeText={(t) => {
            setWkKey(t);
            setWkResult(null);
          }}
          placeholder="paste from wanikani.com/settings/personal_access_tokens"
          placeholderTextColor="#666"
          secureTextEntry
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.button, wkSyncing && styles.buttonDisabled]}
            disabled={wkSyncing}
            onPress={onSyncWanikani}
          >
            <Text style={styles.buttonText}>
              {wkSyncing
                ? wkProgress
                  ? `Syncing… ${wkProgress.done}/${wkProgress.total}`
                  : 'Syncing…'
                : wkKey.trim().length === 0
                  ? 'Disconnect'
                  : wkStats
                    ? 'Re-sync kanji'
                    : 'Save & sync kanji'}
            </Text>
          </Pressable>
        </View>
        {wkStats && (
          <Text style={styles.label}>
            {wkStats.count} kanji cached · synced {formatRelative(wkStats.fetchedAt)}
          </Text>
        )}
        {wkResult && (
          <Text style={[styles.testResult, wkResult.ok ? styles.ok : styles.bad]}>
            {wkResult.ok ? '✓ ' : '✗ '}
            {wkResult.message}
          </Text>
        )}
      </Section>

      <Section title="Playback">
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Auto-pause at end of subtitle line</Text>
          <Switch
            value={settings.autoPauseAtLineEnd}
            onValueChange={(v) => update({ autoPauseAtLineEnd: v })}
          />
        </View>
        <Label>Default subtitle mode</Label>
        <View style={styles.choiceRow}>
          {SUB_MODES.map((m) => (
            <Pressable
              key={m}
              style={[styles.choice, settings.defaultSubtitleMode === m && styles.choiceActive]}
              onPress={() => update({ defaultSubtitleMode: m })}
            >
              <Text style={styles.choiceText}>{MODE_LABELS[m]}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function parsePositiveInt(s: string): number {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, gap: 24 },
  loading: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  section: { gap: 8 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 4 },
  label: { color: '#aaa', fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: '#181818',
    color: '#fff',
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: {
    backgroundColor: '#222',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '500' },
  testResult: { marginTop: 8, fontSize: 13 },
  ok: { color: '#4ade80' },
  bad: { color: '#f87171' },
  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  choice: {
    backgroundColor: '#181818',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  choiceActive: { backgroundColor: '#3b82f6' },
  choiceText: { color: '#fff', textTransform: 'capitalize' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: { color: '#fff', fontSize: 15, flex: 1, marginRight: 12 },
  ttsBlock: { gap: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#1f2937' },
  choiceInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hiddenPlayer: { width: 0, height: 0 },
});
