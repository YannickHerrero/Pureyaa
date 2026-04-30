import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Phase = 'welcome' | 'install' | 'api-key';

export default function OnboardingScreen() {
  const [phase, setPhase] = useState<Phase>('welcome');

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'welcome' && <Welcome onContinue={() => setPhase('install')} />}
      {phase === 'install' && <InstallStub />}
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

function InstallStub() {
  return <Text style={styles.copy}>Install step (coming next).</Text>;
}

function ApiKeyStub() {
  return <Text style={styles.copy}>API key step (coming next).</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  copy: { color: '#aaa', fontSize: 15, lineHeight: 22 },
  primary: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
