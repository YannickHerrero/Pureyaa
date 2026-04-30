import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#111' },
        headerTitleStyle: { color: '#fff' },
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222' },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved Words' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
