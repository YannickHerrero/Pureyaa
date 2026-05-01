import { useEffect, useState } from 'react';
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
import type { AnkiSettings, AppSettings, ModelId, SubtitleMode } from '@/types';
import { DEFAULT_ANKI_SETTINGS, DEFAULT_SETTINGS } from '@/types';
import {
  getSettings,
  saveSettings,
  getApiKey,
  setApiKey,
  clearApiKey,
} from '@/storage/settings';
import { getAnkiSettings, saveAnkiSettings } from '@/storage/ankiSettings';
import { testApiKey } from '@/analysis/claude';
import { makeAnkiClient, AnkiConnectError } from '@/anki/client';
import { ensurePureyaaModel } from '@/anki/model';

const MODELS: ModelId[] = ['haiku', 'sonnet', 'opus'];
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

  useEffect(() => {
    (async () => {
      const [s, a, k] = await Promise.all([getSettings(), getAnkiSettings(), getApiKey()]);
      setSettings(s);
      setAnki(a);
      setApiKeyState(k ?? '');
      setLoaded(true);
    })();
  }, []);

  const updateAnki = async (patch: Partial<AnkiSettings>) => {
    const next = { ...anki, ...patch };
    setAnki(next);
    await saveAnkiSettings(next);
  };

  const [ankiTesting, setAnkiTesting] = useState(false);
  const [ankiResult, setAnkiResult] = useState<{ ok: boolean; message: string } | null>(null);
  const onTestAnki = async () => {
    setAnkiTesting(true);
    setAnkiResult(null);
    try {
      const client = makeAnkiClient(anki.ankiConnectUrl.trim());
      const v = await client.version();
      await ensurePureyaaModel(client);
      setAnkiResult({ ok: true, message: `Connected (AnkiConnect v${v}); model ready.` });
    } catch (e) {
      const err = e as Error;
      const detail =
        e instanceof AnkiConnectError && e.kind === 'unreachable'
          ? 'Make sure AnkiconnectAndroid is installed and the service is running.'
          : err.message;
      setAnkiResult({ ok: false, message: detail });
    } finally {
      setAnkiTesting(false);
    }
  };

  const update = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  const onSaveKey = async () => {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      await clearApiKey();
    } else {
      await setApiKey(trimmed);
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
      if (keyDirty) await setApiKey(trimmed);
      await testApiKey(trimmed, settings.modelId);
      setKeyDirty(false);
      setTestResult({ ok: true, message: 'Connection successful' });
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
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
      <Section title="LLM configuration">
        <Label>Anthropic API key</Label>
        <TextInput
          value={apiKey}
          onChangeText={(t) => {
            setApiKeyState(t);
            setKeyDirty(true);
          }}
          placeholder="sk-ant-..."
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

        <Label>Model</Label>
        <View style={styles.choiceRow}>
          {MODELS.map((m) => (
            <Pressable
              key={m}
              style={[styles.choice, settings.modelId === m && styles.choiceActive]}
              onPress={() => update({ modelId: m })}
            >
              <Text style={styles.choiceText}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Anki">
        <Label>AnkiConnect URL</Label>
        <TextInput
          value={anki.ankiConnectUrl}
          onChangeText={(t) => updateAnki({ ankiConnectUrl: t })}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://127.0.0.1:8765"
          placeholderTextColor="#666"
        />

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
            onPress={onTestAnki}
          >
            <Text style={styles.buttonText}>{ankiTesting ? 'Testing…' : 'Test connection'}</Text>
          </Pressable>
        </View>
        {ankiResult && (
          <Text style={[styles.testResult, ankiResult.ok ? styles.ok : styles.bad]}>
            {ankiResult.ok ? '✓ ' : '✗ '}
            {ankiResult.message}
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
});
