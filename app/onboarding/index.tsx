import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  installDictionaries,
  type InstallStage,
} from '@/onboarding/dict-installer';
import { markOnboarded } from '@/onboarding/state';
import { setApiKey } from '@/storage/settings';
import { testApiKey } from '@/analysis/claude';
import { DEFAULT_SETTINGS } from '@/types';

type Phase = 'welcome' | 'install' | 'api-key';

const STAGE_LABELS: Record<InstallStage, string> = {
  'fetching-release': 'Checking for latest dictionaries…',
  'downloading-jmdict': 'Downloading JMdict (~11 MB)…',
  'processing-jmdict': 'Processing JMdict…',
  'downloading-jmnedict': 'Downloading JMnedict (~13 MB)…',
  'processing-jmnedict': 'Processing JMnedict…',
  done: 'Done.',
};

export default function OnboardingScreen() {
  const [phase, setPhase] = useState<Phase>('welcome');
  const router = useRouter();

  const finish = async () => {
    await markOnboarded();
    router.replace('/library');
  };

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'welcome' && <Welcome onContinue={() => setPhase('install')} />}
      {phase === 'install' && <Install onDone={() => setPhase('api-key')} />}
      {phase === 'api-key' && <ApiKey onDone={finish} />}
    </SafeAreaView>
  );
}

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.body}>
      <Text style={styles.title}>Welcome to Pureyaa</Text>
      <Text style={styles.copy}>
        We&apos;ll grab the Japanese dictionaries you need (~25 MB) and then ask
        for your Anthropic API key. One-time setup.
      </Text>
      <Pressable style={styles.primary} onPress={onContinue}>
        <Text style={styles.primaryText}>Get started</Text>
      </Pressable>
    </View>
  );
}

function Install({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<InstallStage>('fetching-release');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        await installDictionaries((p) => {
          if (!cancelled) setStage(p.stage);
        });
        if (!cancelled) onDone();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, onDone]);

  if (error) {
    return (
      <View style={styles.body}>
        <Text style={styles.title}>Download failed</Text>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.primary} onPress={() => setAttempt((n) => n + 1)}>
          <Text style={styles.primaryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <Text style={styles.title}>Setting up dictionaries</Text>
      <View style={styles.statusRow}>
        <ActivityIndicator color="#3b82f6" />
        <Text style={styles.copy}>{STAGE_LABELS[stage]}</Text>
      </View>
      <Text style={styles.hint}>
        Processing happens on device — JMnedict is the slowest step (~30s).
      </Text>
    </View>
  );
}

function ApiKey({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const trimmed = key.trim();

  const onTest = async () => {
    if (trimmed.length === 0) return;
    setTesting(true);
    setResult(null);
    try {
      await testApiKey(trimmed, DEFAULT_SETTINGS.modelId);
      setResult({ ok: true, message: 'Connection successful' });
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const onContinue = async () => {
    if (trimmed.length > 0) await setApiKey(trimmed);
    await onDone();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Text style={styles.title}>Anthropic API key</Text>
        <Text style={styles.copy}>
          Pureyaa uses Claude to translate Japanese subtitles. Get a key at
          console.anthropic.com — you can also add it later in Settings.
        </Text>
        <TextInput
          value={key}
          onChangeText={(t) => {
            setKey(t);
            setResult(null);
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
            style={[styles.secondary, (testing || trimmed.length === 0) && styles.disabled]}
            disabled={testing || trimmed.length === 0}
            onPress={onTest}
          >
            <Text style={styles.secondaryText}>{testing ? 'Testing…' : 'Test'}</Text>
          </Pressable>
          <Pressable style={[styles.primary, styles.flex]} onPress={onContinue}>
            <Text style={styles.primaryText}>
              {trimmed.length === 0 ? 'Skip for now' : 'Save & continue'}
            </Text>
          </Pressable>
        </View>
        {result && (
          <Text style={[styles.testResult, result.ok ? styles.ok : styles.bad]}>
            {result.ok ? '✓ ' : '✗ '}
            {result.message}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  copy: { color: '#aaa', fontSize: 15, lineHeight: 22 },
  hint: { color: '#666', fontSize: 13, lineHeight: 18 },
  error: { color: '#f87171', fontSize: 14, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    backgroundColor: '#181818',
    color: '#fff',
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  primary: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: {
    backgroundColor: '#222',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '500' },
  disabled: { opacity: 0.5 },
  testResult: { fontSize: 13 },
  ok: { color: '#4ade80' },
  bad: { color: '#f87171' },
});
