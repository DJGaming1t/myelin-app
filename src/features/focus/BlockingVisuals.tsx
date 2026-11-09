import { paperSurfaces } from '@/src/theme/paperSurfaces';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

export type BlockingGlyphName =
  | 'apps'
  | 'globe'
  | 'calendar'
  | 'sliders'
  | 'shield'
  | 'arrow'
  | 'search'
  | 'check'
  | 'lock';

const GLYPH_MAP: Record<BlockingGlyphName, string> = {
  apps: '⊞',
  globe: '◎',
  calendar: '▤',
  sliders: '☰',
  shield: '◈',
  arrow: '→',
  search: '⌕',
  check: '✓',
  lock: '🔒',
};

export function BlockingGlyph({
  name,
  size = 18,
  color = colors.text,
}: {
  name: BlockingGlyphName;
  size?: number;
  color?: string;
}) {
  return (
    <Text
      accessible={false}
      style={{
        color,
        fontSize: Math.max(12, size - 2),
        lineHeight: size + 2,
        fontWeight: '700',
        textAlign: 'center',
      }}>
      {GLYPH_MAP[name] ?? '•'}
    </Text>
  );
}

export function AppAvatar({
  label,
  identifier,
  iconUri,
}: {
  label: string;
  identifier: string;
  iconUri?: string | null;
}) {
  if (iconUri) {
    return <Image source={{ uri: iconUri }} style={styles.avatar} />;
  }
  const initial = (label.trim()[0] || identifier.trim()[0] || 'A').toUpperCase();
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export function ShieldEmblem({ size = 62 }: { size?: number }) {
  return (
    <View
      accessible={false}
      style={[
        styles.emblem,
        { width: size, height: size, borderRadius: Math.round(size * 0.32) },
      ]}>
      <BlockingGlyph name="shield" size={Math.round(size * 0.44)} color={colors.accentBright} />
    </View>
  );
}

export function StrengthMark({
  level,
  selected,
}: {
  level: number;
  selected?: boolean;
}) {
  return (
    <View style={[styles.strengthBox, selected && styles.strengthBoxSelected]}>
      {[1, 2, 3].map((bar) => (
        <View
          key={bar}
          style={[
            styles.strengthBar,
            { height: 6 + bar * 4 },
            bar <= level
              ? selected
                ? styles.strengthBarActive
                : styles.strengthBarFilled
              : styles.strengthBarIdle,
          ]}
        />
      ))}
    </View>
  );
}

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function WeekStrip({
  days,
  enabled,
}: {
  days: number[];
  enabled?: boolean;
}) {
  return (
    <View style={styles.weekRow}>
      {WEEK_LABELS.map((label, index) => {
        const active = days.includes(index);
        return (
          <View
            key={index}
            style={[
              styles.weekDot,
              active && (enabled ? styles.weekDotActive : styles.weekDotMuted),
            ]}>
            <Text
              style={[
                styles.weekDotText,
                active && (enabled ? styles.weekDotTextActive : styles.weekDotTextMuted),
              ]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: paperSurfaces.card,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emblem: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: paperSurfaces.card,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 9,
  },
  strengthBoxSelected: {
    backgroundColor: colors.accentSoft,
  },
  strengthBar: {
    width: 4,
    borderRadius: 2,
  },
  strengthBarActive: {
    backgroundColor: colors.accentBright,
  },
  strengthBarFilled: {
    backgroundColor: colors.textDim,
  },
  strengthBarIdle: {
    backgroundColor: colors.lineStrong,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  weekDot: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: paperSurfaces.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotActive: {
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
  },
  weekDotMuted: {
    borderColor: colors.lineStrong,
    backgroundColor: paperSurfaces.card,
  },
  weekDotText: {
    color: colors.subtle,
    fontSize: 11,
    fontWeight: '600',
  },
  weekDotTextActive: {
    color: colors.accentBright,
    fontWeight: '700',
  },
  weekDotTextMuted: {
    color: colors.muted,
  },
});
