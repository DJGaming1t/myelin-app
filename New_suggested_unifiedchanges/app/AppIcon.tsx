import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

export type AppIconName = 'today' | 'library' | 'review' | 'progress' | 'add' | 'settings' | 'calendar' | 'chevron';

type Props = {
  name: AppIconName;
  size?: number;
  color?: string;
};

export function AppIcon({ name, size = 20, color = colors.muted }: Props) {
  const stroke = Math.max(1.5, size * 0.085);

  if (name === 'add') {
    const arm = Math.round(size * 0.58);
    return (
      <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: arm, height: stroke, borderRadius: stroke, backgroundColor: color, position: 'absolute' }} />
        <View style={{ width: stroke, height: arm, borderRadius: stroke, backgroundColor: color, position: 'absolute' }} />
      </View>
    );
  }

  if (name === 'today' || name === 'calendar') {
    return (
      <View
        accessible={false}
        style={{
          width: size,
          height: size * 0.9,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: size * 0.22,
          marginTop: size * 0.05,
          overflow: 'hidden',
        }}>
        <View style={{ height: stroke, backgroundColor: color, marginTop: size * 0.27 }} />
        {name === 'today' ? (
          <View style={{ width: size * 0.2, height: size * 0.2, borderRadius: size, backgroundColor: color, alignSelf: 'center', marginTop: size * 0.14 }} />
        ) : null}
      </View>
    );
  }

  if (name === 'library') {
    return (
      <View accessible={false} style={[styles.row, { width: size, height: size, gap: size * 0.1 }]}>
        {[0.26, 0.32, 0.24].map((width, index) => (
          <View
            key={index}
            style={{
              flex: width,
              height: size * (index === 1 ? 0.9 : 0.78),
              alignSelf: 'flex-end',
              borderRadius: size * 0.12,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
        ))}
      </View>
    );
  }

  if (name === 'review') {
    return (
      <View accessible={false} style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', left: size * 0.1, top: size * 0.22, width: size * 0.7, height: size * 0.62, borderRadius: size * 0.18, borderWidth: stroke, borderColor: color, opacity: 0.55 }} />
        <View style={{ position: 'absolute', right: size * 0.04, top: size * 0.07, width: size * 0.7, height: size * 0.62, borderRadius: size * 0.18, borderWidth: stroke, borderColor: color, backgroundColor: colors.bg }} />
        <View style={{ position: 'absolute', right: size * 0.22, top: size * 0.3, width: size * 0.25, height: stroke, borderRadius: stroke, backgroundColor: color }} />
      </View>
    );
  }

  if (name === 'progress') {
    return (
      <View accessible={false} style={[styles.row, { width: size, height: size, alignItems: 'flex-end', justifyContent: 'center', gap: size * 0.1 }]}>
        {[0.42, 0.7, 0.95].map((height, index) => (
          <View key={index} style={{ width: size * 0.2, height: size * height, borderRadius: size * 0.08, backgroundColor: color, opacity: 0.62 + index * 0.19 }} />
        ))}
      </View>
    );
  }

  if (name === 'settings') {
    return (
      <View accessible={false} style={{ width: size, height: size, borderRadius: size, borderWidth: stroke, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: color }} />
      </View>
    );
  }

  return (
    <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.42, height: size * 0.42, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
