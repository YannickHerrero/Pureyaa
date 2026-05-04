import { useEffect } from 'react';
import { Platform, ToastAndroid } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOnboarded } from '@/onboarding/state';
import { STORAGE_KEYS } from '@/storage/keys';

/**
 * Show a toast the first time we boot into a freshly-applied OTA update.
 * Updates.updateId is null in dev (no embedded update), the embedded
 * binary's update id on a fresh install, and the OTA's id after one
 * has been applied. We compare against the last id we acknowledged —
 * matching ids => no toast, mismatched + we've seen an id before
 * => actual update, show the toast.
 */
function useOtaUpdateToast() {
  useEffect(() => {
    (async () => {
      const current = Updates.updateId;
      if (!current) return;
      const last = await AsyncStorage.getItem(STORAGE_KEYS.lastSeenUpdateId);
      await AsyncStorage.setItem(STORAGE_KEYS.lastSeenUpdateId, current);
      if (last && last !== current && Platform.OS === 'android') {
        ToastAndroid.show('✓ Updated to latest version', ToastAndroid.SHORT);
      }
    })();
  }, []);
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  useOtaUpdateToast();

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
