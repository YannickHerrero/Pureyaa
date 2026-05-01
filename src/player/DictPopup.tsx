import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import type { Cue, DictMatch, SavedWord } from '@/types';
import { getEntries, type DictEntry } from '@/analysis/dict';
import { uuid } from '@/utils/uuid';
import { addSavedWord } from '@/storage/savedWords';

export interface DictPopupProps {
  visible: boolean;
  cue: Cue | null;
  tokenIndex: number;
  sourceEntryId: string;
  onClose: () => void;
}

export function DictPopup({
  visible,
  cue,
  tokenIndex,
  sourceEntryId,
  onClose,
}: DictPopupProps) {
  const matches = cue?.matchesByTokenIndex[tokenIndex] ?? [];
  const [activeIdx, setActiveIdx] = useState(0);

  const tappedWord = useMemo(() => {
    if (!cue) return '';
    const t = cue.tokens[tokenIndex];
    return t?.surface ?? '';
  }, [cue, tokenIndex]);

  // Reset to longest match when cue or token changes
  useMemo(() => {
    setActiveIdx(0);
  }, [cue?.index, tokenIndex]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.tappedWord}>{tappedWord}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {cue ? (
              <View style={styles.cueContext}>
                <Text style={styles.cueJp}>{cue.text}</Text>
                {cue.translation && cue.translation.trim().length > 0 ? (
                  <Text style={styles.cueEn}>{cue.translation}</Text>
                ) : null}
              </View>
            ) : null}

            {matches.length === 0 ? (
              <Text style={styles.noMatch}>No dictionary match.</Text>
            ) : (
              <>
                <MatchTabs
                  matches={matches}
                  active={activeIdx}
                  onSelect={setActiveIdx}
                />
                <MatchView
                  match={matches[activeIdx]}
                  cue={cue}
                  sourceEntryId={sourceEntryId}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MatchTabs({
  matches,
  active,
  onSelect,
}: {
  matches: DictMatch[];
  active: number;
  onSelect: (i: number) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
      {matches.map((m, i) => {
        const len = m.tokenSpan[1] - m.tokenSpan[0] + 1;
        const label = `${m.form} (${len}, ${m.dict === 'jmdict' ? 'JMDict' : 'JMnedict'})`;
        return (
          <Pressable
            key={`${m.dict}-${m.form}-${i}`}
            style={[styles.tab, active === i && styles.tabActive]}
            onPress={() => onSelect(i)}
          >
            <Text style={styles.tabText}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MatchView({
  match,
  cue,
  sourceEntryId,
}: {
  match: DictMatch;
  cue: Cue | null;
  sourceEntryId: string;
}) {
  const entries = getEntries(match.entryIds, match.dict);
  if (entries.length === 0) {
    return <Text style={styles.noMatch}>Dictionary entry missing for this id.</Text>;
  }
  return (
    <View style={styles.entries}>
      {entries.map((e) => (
        <DictEntryView
          key={e.id}
          entry={e}
          dict={match.dict}
          cue={cue}
          sourceEntryId={sourceEntryId}
        />
      ))}
    </View>
  );
}

function DictEntryView({
  entry,
  dict,
  cue,
  sourceEntryId,
}: {
  entry: DictEntry;
  dict: 'jmdict' | 'jmnedict';
  cue: Cue | null;
  sourceEntryId: string;
}) {
  const [saved, setSaved] = useState(false);
  const surface = entry.forms[0] ?? entry.readings[0] ?? '';
  const reading = entry.readings[0] ?? '';
  const lemma = entry.forms[0];

  const onSave = async () => {
    if (!cue || saved) return;
    const firstGloss = entry.senses[0]?.glosses[0] ?? '';
    const word: SavedWord = {
      id: uuid(),
      surface,
      reading,
      shortDefinition: firstGloss,
      cueText: cue.text,
      sourceEntryId,
      sourceCueIndex: cue.index,
      dictEntryIds: [entry.id],
      dict,
      dateSavedISO: new Date().toISOString(),
    };
    await addSavedWord(word);
    setSaved(true);
  };

  return (
    <View style={styles.entry}>
      <View style={styles.entryHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headSurface}>{surface}</Text>
          {reading && reading !== surface ? (
            <Text style={styles.headReading}>{reading}</Text>
          ) : null}
          {lemma && lemma !== surface ? (
            <Text style={styles.headLemma}>lemma: {lemma}</Text>
          ) : null}
        </View>
        <Pressable onPress={onSave} hitSlop={8}>
          <Text style={[styles.star, saved && styles.starOn]}>{saved ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      {entry.frequency ? <Text style={styles.frequency}>freq: {entry.frequency}</Text> : null}
      {entry.nameType && entry.nameType.length > 0 ? (
        <Text style={styles.nameType}>{entry.nameType.join(' / ')}</Text>
      ) : null}

      {entry.senses.map((sense, si) => (
        <View key={si} style={styles.sense}>
          {sense.pos.length > 0 && <Text style={styles.pos}>{sense.pos.join(', ')}</Text>}
          {sense.glosses.map((g, gi) => (
            <Text key={gi} style={styles.gloss}>{`${gi + 1}. ${g}`}</Text>
          ))}
          {sense.fields && sense.fields.length > 0 ? (
            <Text style={styles.tag}>{sense.fields.join(' · ')}</Text>
          ) : null}
          {sense.misc && sense.misc.length > 0 ? (
            <Text style={styles.tag}>{sense.misc.join(' · ')}</Text>
          ) : null}
          {sense.examples?.map((ex, ei) => (
            <View key={ei} style={styles.example}>
              {ex.jpn ? <Text style={styles.exJp}>{ex.jpn}</Text> : null}
              {ex.eng ? <Text style={styles.exEn}>{ex.eng}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    width: '100%',
    maxWidth: 520,
    // flex + maxHeight gives the dialog a definite height (capped at 85%),
    // which is needed for the inner ScrollView's flex: 1 to actually scroll.
    flex: 1,
    maxHeight: '85%',
    padding: 16,
    gap: 12,
  },
  bodyContent: { paddingBottom: 8, gap: 12 },
  cueContext: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  cueJp: { color: '#fff', fontSize: 14, lineHeight: 20 },
  cueEn: { color: '#aaa', fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tappedWord: { color: '#fff', fontSize: 22, fontWeight: '600' },
  close: { color: '#888', fontSize: 18, padding: 8 },
  tabs: { flexGrow: 0 },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    marginRight: 6,
  },
  tabActive: { backgroundColor: '#3b82f6' },
  tabText: { color: '#fff', fontSize: 12 },
  body: { flex: 1 },
  noMatch: { color: '#888', fontStyle: 'italic' },
  entries: { gap: 16 },
  entry: { gap: 4 },
  entryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headSurface: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headReading: { color: '#aaa', fontSize: 14 },
  headLemma: { color: '#666', fontSize: 12, marginTop: 2 },
  star: { color: '#666', fontSize: 24 },
  starOn: { color: '#fbbf24' },
  frequency: { color: '#888', fontSize: 12 },
  nameType: { color: '#a78bfa', fontSize: 12, fontWeight: '600' },
  sense: { marginTop: 6, gap: 2 },
  pos: { color: '#60a5fa', fontSize: 12 },
  gloss: { color: '#fff', fontSize: 15 },
  tag: { color: '#888', fontSize: 12, fontStyle: 'italic' },
  example: { marginTop: 4, paddingLeft: 8, borderLeftColor: '#333', borderLeftWidth: 2 },
  exJp: { color: '#ddd', fontSize: 13 },
  exEn: { color: '#888', fontSize: 12 },
});
