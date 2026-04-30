import { View, Text, StyleSheet } from 'react-native';

export default function SavedWordsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Saved Words — empty</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: '#888' },
});
