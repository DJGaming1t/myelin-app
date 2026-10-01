import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, AppIconName } from '@/src/components/app/AppIcon';
import { colors, layout, radius, space, type } from '@/src/theme/tokens';

type Props = {
  icon?: AppIconName;
  title: string;
  detail?: string;
  meta?: string;
  onPress?: () => void;
  accent?: boolean;
};

export function ActionRow({ icon, title, detail, meta, onPress, accent = false }: Props) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.iconWrap, accent && styles.iconWrapAccent]}>
          <AppIcon name={icon} size={19} color={accent ? colors.accent : colors.textDim} />
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {meta ? <Text style={[styles.meta, accent && styles.metaAccent]}>{meta}</Text> : null}
      {onPress ? <AppIcon name="chevron" size={16} color={colors.subtle} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, detail, meta].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapAccent: { backgroundColor: colors.accentFaint },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, ...type.bodyStrong },
  detail: { color: colors.muted, ...type.meta, marginTop: 2 },
  meta: { color: colors.muted, ...type.meta, fontWeight: '600' },
  metaAccent: { color: colors.accent },
  pressed: { opacity: 0.72, backgroundColor: colors.accentFaint },
});
