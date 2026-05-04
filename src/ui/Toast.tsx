/**
 * Tiny cross-platform toast. On Android it just delegates to ToastAndroid
 * (native, fast, no extra views). On iOS it renders a small auto-dismiss
 * pill at the bottom of the screen via a portal-less overlay.
 *
 * Designed to replace the two ToastAndroid call sites without dragging in
 * react-native-toast-message just for those.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, ToastAndroid, View } from 'react-native';

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/**
 * Trigger a toast from anywhere. On iOS, a <ToastHost /> must be mounted
 * somewhere in the tree (root layout) for the message to render.
 */
export function showToast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  for (const l of listeners) l(message);
}

/**
 * Mount once at the root. iOS only — Android renders nothing because
 * ToastAndroid handles its own UI.
 */
export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'android') return;
    const listener: Listener = (msg) => setMessage(msg);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMessage(null);
    });
  }, [message, opacity]);

  if (Platform.OS === 'android' || !message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <View style={styles.pill}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 80,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: '85%',
  },
  text: { color: '#fff', fontSize: 14 },
});
