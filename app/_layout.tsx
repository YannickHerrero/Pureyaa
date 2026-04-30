import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { isOnboarded } from '@/onboarding/state';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const onboarded = await isOnboarded();
      const inOnboarding = segments[0] === 'onboarding';
      if (!onboarded && !inOnboarding) {
        router.replace('/onboarding');
      } else if (onboarded && inOnboarding) {
        router.replace('/library');
      }
    })();
  }, [segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
