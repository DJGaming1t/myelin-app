import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AmbientBackdrop } from '@/src/components/app/AmbientBackdrop';
import { ScreenHeader } from '@/src/components/app/ScreenHeader';
import { AnimatedDisclosure } from '@/src/components/motion/AnimatedDisclosure';
import { FEATURE_GUIDES, FeatureGuide, GuideAction, tutorialDestination } from '@/src/features/guides/guide-registry';
import { HELP_EXAMPLES, searchGuides } from '@/src/features/guides/help-search';
import { colors, layout, radius, space } from '@/src/theme/tokens';

export default function HelpScreen() {
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const searching = query.trim().length > 0;
  const results: readonly FeatureGuide[] = searching ? searchGuides(query) : browse ? FEATURE_GUIDES : [];

  function changeQuery(value: string) {
    setQuery(value); setExpanded(null); setBrowse(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function runAction(action: GuideAction) {
    Keyboard.dismiss();
    if (action.type === 'navigate') router.navigate(action.route);
    else router.dismissTo(tutorialDestination(action.tutorialId));
  }
  function browseAll() {
    Keyboard.dismiss(); changeQuery(''); setBrowse(true);
  }

  return <SafeAreaView style={styles.safe}>
    <AmbientBackdrop />
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Help" variant="compact" backLabel="Back"
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(app)/settings')} />
      <View style={styles.searchArea}>
        <Text style={styles.intro}>Find your next step. Works offline.</Text>
        <View style={styles.searchBox}>
          <TextInput ref={input} accessibilityLabel="Search MYELIN help" placeholder="Try ‘start focus’"
            placeholderTextColor={colors.muted} value={query} onChangeText={changeQuery} maxLength={200}
            autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()}
            style={styles.input} />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear help search"
            onPress={() => { changeQuery(''); input.current?.focus(); }} style={styles.clear}>
            <Text style={styles.secondaryText}>Clear</Text>
          </Pressable> : null}
        </View>
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!searching && !browse ? <>
          <Text style={styles.sectionTitle}>TRY A QUESTION</Text>
          {HELP_EXAMPLES.map(guide => <Pressable key={guide.id} accessibilityRole="button"
            accessibilityLabel={guide.exampleQuery} onPress={() => { Keyboard.dismiss(); changeQuery(guide.exampleQuery); }}
            style={({ pressed }) => [styles.example, pressed && styles.pressed]}>
            <Text style={styles.exampleText}>{guide.exampleQuery}</Text><Text style={styles.arrow}>→</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={browseAll} style={styles.browse}>
            <Text style={styles.linkText}>Browse all guides</Text>
          </Pressable>
        </> : <>
          <Text accessibilityLiveRegion="polite" style={styles.sectionTitle}>
            {searching ? `${results.length} ${results.length === 1 ? 'MATCH' : 'MATCHES'}` : 'ALL GUIDES'}
          </Text>
          {!results.length ? <View style={styles.empty}>
            <Text accessibilityRole="header" style={styles.name}>No matching guide yet</Text>
            <Text style={styles.description}>Try a shorter phrase such as “move task”, “unsure” or “focus”.</Text>
            <Pressable accessibilityRole="button" onPress={browseAll} style={styles.browse}>
              <Text style={styles.linkText}>Browse all guides</Text>
            </Pressable>
          </View> : results.map(feature => <View key={feature.id} testID={`help-result-${feature.id}`} style={styles.result}>
            <Text accessibilityRole="header" style={styles.name}>{feature.name}</Text>
            <Text style={styles.description} numberOfLines={expanded === feature.id ? undefined : 2}>{feature.description}</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${expanded === feature.id ? 'Hide explanation for' : 'Explain'} ${feature.name}`}
                accessibilityState={{ expanded: expanded === feature.id }}
                onPress={() => { Keyboard.dismiss(); setExpanded(current => current === feature.id ? null : feature.id); }} style={styles.action}>
                <Text style={styles.linkText}>{expanded === feature.id ? 'Hide' : 'Explain'}</Text>
              </Pressable>
              {feature.supportedActions.map(action => <Pressable key={action.type} accessibilityRole="button"
                accessibilityLabel={action.type === 'navigate' ? `Go to ${feature.name}` : `Show me ${feature.name}`}
                onPress={() => runAction(action)} style={styles.action}>
                <Text style={styles.secondaryText}>{action.type === 'navigate' ? 'Go there' : 'Show me'}</Text>
              </Pressable>)}
            </View>
            <AnimatedDisclosure visible={expanded === feature.id} style={styles.steps}>
              {feature.helpSteps.map((step, i) => <View key={step} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{i + 1}</Text><Text style={styles.stepText}>{step}</Text>
              </View>)}
            </AnimatedDisclosure>
          </View>)}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, page: { flex: 1 },
  searchArea: { width: '100%', maxWidth: layout.readingMax, alignSelf: 'center', paddingHorizontal: space.lg, paddingBottom: space.md },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.panel, borderRadius: radius.md },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 16 },
  clear: { minHeight: 48, minWidth: 56, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  content: { width: '100%', maxWidth: layout.readingMax, alignSelf: 'center', paddingHorizontal: space.lg, paddingBottom: 32 },
  sectionTitle: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  example: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 12 },
  exampleText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 }, arrow: { color: colors.accent, fontSize: 18 },
  browse: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8 },
  result: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, marginTop: 6 },
  action: { minHeight: 48, minWidth: 64, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { color: colors.accent, fontSize: 14, fontWeight: '600' }, secondaryText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  steps: { gap: 12, paddingTop: 8, paddingBottom: 8 }, stepRow: { flexDirection: 'row', gap: 12 },
  stepNumber: { color: colors.accent, fontSize: 13, lineHeight: 22, fontWeight: '700', minWidth: 14 },
  stepText: { flex: 1, color: colors.textDim, fontSize: 14, lineHeight: 22 },
  empty: { paddingVertical: 24 }, pressed: { opacity: 0.7 },
});
