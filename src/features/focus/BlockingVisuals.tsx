import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/tokens';

export type BlockingGlyphName = 'shield' | 'apps' | 'globe' | 'calendar' | 'sliders' | 'search' | 'lock' | 'arrow' | 'check' | 'plus';
const TINTS = ['#F4A78C', '#B9ACEE', '#9EBFD8', '#A9CAB4', '#D9BD86'];

/** Small native primitives keep the visual language identical on Android and web. */
export function BlockingGlyph({ name, size = 22, color = colors.textDim }: { name: BlockingGlyphName; size?: number; color?: string }) {
  const stroke = Math.max(1.5, size * 0.075);
  const line = { borderColor: color, borderWidth: stroke };
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {name === 'shield' ? <View style={{ ...line, width: size * .72, height: size * .84, borderTopLeftRadius: size * .16, borderTopRightRadius: size * .16, borderBottomLeftRadius: size * .38, borderBottomRightRadius: size * .38, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: size * .27, height: size * .15, borderLeftWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: '-45deg' }], marginTop: -size * .08 }} /></View> : null}
    {name === 'apps' ? <View style={{ width: size * .82, height: size * .82, flexDirection: 'row', flexWrap: 'wrap', gap: size * .12 }}>{[0, 1, 2, 3].map(i => <View key={i} style={{ ...line, width: size * .35, height: size * .35, borderRadius: size * .09 }} />)}</View> : null}
    {name === 'globe' ? <View style={{ ...line, width: size * .86, height: size * .86, borderRadius: size, alignItems: 'center', justifyContent: 'center' }}><View style={{ position: 'absolute', width: size * .34, height: size * .75, borderRadius: size, borderLeftWidth: stroke, borderRightWidth: stroke, borderColor: color }} /><View style={{ width: size * .72, height: stroke, backgroundColor: color }} /></View> : null}
    {name === 'calendar' ? <View style={{ ...line, width: size * .8, height: size * .76, borderRadius: size * .15, marginTop: size * .08 }}><View style={{ height: stroke, backgroundColor: color, marginTop: size * .19 }} /><View style={{ position: 'absolute', width: stroke, height: size * .2, left: size * .15, top: -size * .12, backgroundColor: color }} /><View style={{ position: 'absolute', width: stroke, height: size * .2, right: size * .15, top: -size * .12, backgroundColor: color }} /></View> : null}
    {name === 'sliders' ? <View style={{ width: size * .8, gap: size * .22 }}>{[.18, .55, .3].map((position, i) => <View key={i} style={{ height: stroke, backgroundColor: color }}><View style={{ position: 'absolute', left: size * position, top: -size * .07, width: size * .16, height: size * .16, borderRadius: size, backgroundColor: color }} /></View>)}</View> : null}
    {name === 'search' ? <><View style={{ ...line, width: size * .58, height: size * .58, borderRadius: size, position: 'absolute', left: size * .08, top: size * .08 }} /><View style={{ width: size * .32, height: stroke, backgroundColor: color, position: 'absolute', left: size * .59, top: size * .73, transform: [{ rotate: '45deg' }] }} /></> : null}
    {name === 'lock' ? <><View style={{ ...line, position: 'absolute', top: size * .07, width: size * .42, height: size * .48, borderRadius: size * .2 }} /><View style={{ ...line, width: size * .68, height: size * .5, borderRadius: size * .12, marginTop: size * .3, backgroundColor: colors.panel }} /></> : null}
    {name === 'arrow' ? <View style={{ width: size * .28, height: size * .28, borderTopWidth: stroke, borderRightWidth: stroke, borderColor: color, transform: [{ rotate: '45deg' }] }} /> : null}
    {name === 'check' ? <View style={{ width: size * .53, height: size * .3, borderLeftWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: '-45deg' }], marginTop: -size * .15 }} /> : null}
    {name === 'plus' ? <><View style={{ width: size * .6, height: stroke, borderRadius: 2, backgroundColor: color }} /><View style={{ width: stroke, height: size * .6, borderRadius: 2, backgroundColor: color, position: 'absolute' }} /></> : null}
  </View>;
}

export function ShieldEmblem({ size = 64 }: { size?: number }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: 'rgba(255,160,122,0.13)', backgroundColor: 'rgba(255,130,93,0.035)' }} />
    <View style={{ position: 'absolute', width: size * .76, height: size * .76, borderRadius: size * .28, backgroundColor: 'rgba(255,130,93,0.09)', borderWidth: 1, borderColor: 'rgba(255,160,122,0.2)', transform: [{ rotate: '-12deg' }] }} />
    <BlockingGlyph name="shield" size={size * .45} color={colors.accentBright} />
  </View>;
}

export function AppAvatar({ label, identifier, iconUri }: { label: string; identifier: string; iconUri?: string }) {
  const [failedUri, setFailedUri] = useState<string | undefined>();
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  const tint = TINTS[Math.abs(hash) % TINTS.length];
  if (iconUri && iconUri !== failedUri) return <Image accessible={false} source={{ uri: iconUri }} onError={() => setFailedUri(iconUri)} style={s.avatar} />;
  return <View accessible={false} style={[s.avatar, { backgroundColor: `${tint}16`, borderColor: `${tint}25`, borderWidth: 1 }]}><Text style={[s.initial, { color: tint }]}>{label.trim().slice(0, 1).toUpperCase() || '·'}</Text></View>;
}

export function StrengthMark({ level, selected }: { level: number; selected: boolean }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[s.strength, selected && s.strengthSelected]}>{[1, 2, 3].map(value => <View key={value} style={{ width: 5, height: 6 + value * 5, borderRadius: 2, backgroundColor: value <= level ? selected ? colors.accentBright : colors.textDim : colors.lineStrong }} />)}</View>;
}

export function WeekStrip({ days, enabled }: { days: number[]; enabled: boolean }) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return <View accessible accessibilityLabel={`Repeats ${days.map(day => names[day]).join(', ')}`} style={s.week}>
    {names.map((name, day) => <View key={name} style={[s.weekDay, days.includes(day) && (enabled ? s.weekDayOn : s.weekDayPaused)]}><Text style={[s.weekLabel, days.includes(day) && s.weekLabelOn]}>{name.slice(0, 1)}</Text></View>)}
  </View>;
}

const s = StyleSheet.create({
  avatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 19, fontWeight: '600' },
  strength: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.panelRaised, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 11, gap: 3 },
  strengthSelected: { backgroundColor: colors.accentSoft },
  week: { flexDirection: 'row', gap: 5, paddingTop: 8, paddingBottom: 4 },
  weekDay: { flex: 1, minWidth: 0, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  weekDayOn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentLine },
  weekDayPaused: { borderWidth: 1, borderColor: colors.lineStrong },
  weekLabel: { fontSize: 10, lineHeight: 16, color: colors.subtle, fontWeight: '600' },
  weekLabelOn: { color: colors.textDim },
});
