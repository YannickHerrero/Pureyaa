import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  installDictionaries,
  type InstallStage,
} from '@/onboarding/dict-installer';

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

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'welcome' && <Welcome onContinue={() => setPhase('install')} />}
      {phase === 'install' && <Install onDone={() => setPhase('api-key')} />}
      {phase === 'api-key' && <ApiKeyStub />}
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

function ApiKeyStub() {
  return <Text style={styles.copy}>API key step (coming next).</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  copy: { color: '#aaa', fontSize: 15, lineHeight: 22 },
  hint: { color: '#666', fontSize: 13, lineHeight: 18 },
  error: { color: '#f87171', fontSize: 14, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primary: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
