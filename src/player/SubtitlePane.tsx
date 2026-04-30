import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import type { Cue, SubtitleMode, Token } from '@/types';

export interface SubtitlePaneProps {
  cue: Cue | null;
  mode: SubtitleMode;
  onTokenPress?: (cue: Cue, tokenIndex: number) => void;
}

export function SubtitlePane({ cue, mode, onTokenPress }: SubtitlePaneProps) {
  const [revealed, setRevealed] = useState<boolean>(false);

  useEffect(() => {
    setRevealed(false);
  }, [cue?.index]);

  if (!cue) {
    return (
      <View style={styles.empty}>
        <Text style={styles.placeholder}>—</Text>
      </View>
    );
  }

  const showJP = mode !== 'en';
  const showEN = mode === 'jp+en' || mode === 'en' || (mode === 'jp' && revealed);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {showJP && (
        <TappableLine cue={cue} onTokenPress={onTokenPress} />
      )}
      {showEN && (
        <View style={styles.enBlock}>
          {cue.translation ? (
            <Text style={styles.translation}>{cue.translation}</Text>
          ) : null}
          {cue.grammarNote ? (
            <Text style={styles.grammarNote}>{cue.grammarNote}</Text>
          ) : null}
        </View>
      )}
      {mode === 'jp' && cue.translation && !revealed && (
        <Pressable style={styles.revealButton} onPress={() => setRevealed(true)}>
          <Text style={styles.revealText}>Reveal translation</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function TappableLine({
  cue,
  onTokenPress,
}: {
  cue: Cue;
  onTokenPress?: (cue: Cue, tokenIndex: number) => void;
}) {
  if (cue.tokens.length === 0) {
    return <Text style={styles.cueText}>{cue.text}</Text>;
  }
  return (
    <View style={styles.line}>
      {cue.tokens.map((t, i) => (
        <TokenChip
          key={i}
          token={t}
          onPress={onTokenPress ? () => onTokenPress(cue, i) : undefined}
        />
      ))}
    </View>
  );
}

function TokenChip({ token, onPress }: { token: Token; onPress?: () => void }) {
  if (!onPress) {
    return <Text style={styles.cueText}>{token.surface}</Text>;
  }
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <Text style={styles.cueText}>{token.surface}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  empty: { padding: 16 },
  placeholder: { color: '#444' },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  cueText: { color: '#fff', fontSize: 22, lineHeight: 32 },
  enBlock: { gap: 6 },
  translation: { color: '#cfcfcf', fontSize: 15, lineHeight: 22 },
  grammarNote: {
    color: '#fbbf24',
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  revealButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  revealText: { color: '#9ca3af', fontSize: 12 },
});
