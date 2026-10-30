import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

export type AppIconName = 'today' | 'library' | 'review' | 'progress' | 'add' | 'settings' | 'calendar' | 'chevron';

type Props = {
  name: AppIconName;
  size?: number;
  color?: string;
};

export function AppIcon({ name, size = 20, color = colors.muted }: Props) {
  const stroke = Math.max(1.5, size * 0.088);

  if (name === 'add') {
    const arm = Math.round(size * 0.56);
    return (
      <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: arm, height: stroke * 1.15, borderRadius: stroke, backgroundColor: color, position: 'absolute' }} />
        <View style={{ width: stroke * 1.15, height: arm, borderRadius: stroke, backgroundColor: color, position: 'absolute' }} />
        <View style={{ width: stroke * 1.8, height: stroke * 1.8, borderRadius: stroke, backgroundColor: color }} />
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
          borderRadius: size * 0.24,
          marginTop: size * 0.05,
          overflow: 'hidden',
        }}>
        <View style={{ height: stroke, backgroundColor: color, marginTop: size * 0.25 }} />
        {name === 'today' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.1, marginTop: size * 0.14 }}>
            <View style={{ width: size * 0.22, height: size * 0.22, borderRadius: size, backgroundColor: color }} />
            <View style={{ width: size * 0.12, height: size * 0.12, borderRadius: size, backgroundColor: color, opacity: 0.55 }} />
          </View>
        ) : null}
      </View>
    );
  }

  if (name === 'library') {
    return (
      <View accessible={false} style={[styles.row, { width: size, height: size, gap: size * 0.09 }]}>
        {[0.26, 0.34, 0.24].map((width, index) => (
          <View
            key={index}
            style={{
              flex: width,
              height: size * (index === 1 ? 0.92 : 0.78),
              alignSelf: 'flex-end',
              borderRadius: size * 0.14,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: size * 0.12,
            }}>
            {index === 1 ? (
              <View style={{ width: size * 0.12, height: size * 0.12, borderRadius: size, backgroundColor: color }} />
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (name === 'review') {
    return (
      <View accessible={false} style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', left: size * 0.08, top: size * 0.24, width: size * 0.68, height: size * 0.6, borderRadius: size * 0.19, borderWidth: stroke, borderColor: color, opacity: 0.5 }} />
        <View style={{ position: 'absolute', right: size * 0.04, top: size * 0.07, width: size * 0.72, height: size * 0.62, borderRadius: size * 0.19, borderWidth: stroke, borderColor: color, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size * 0.22, height: size * 0.22, borderRadius: size, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  if (name === 'progress') {
    return (
      <View accessible={false} style={[styles.row, { width: size, height: size, alignItems: 'flex-end', justifyContent: 'center', gap: size * 0.1 }]}>
        {[0.42, 0.68, 0.94].map((height, index) => (
          <View key={index} style={{ alignItems: 'center', gap: 2 }}>
            {index === 2 ? (
              <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: color }} />
            ) : null}
            <View style={{ width: size * 0.2, height: size * (index === 2 ? height - 0.2 : height), borderRadius: size * 0.09, backgroundColor: color, opacity: 0.6 + index * 0.2 }} />
          </View>
        ))}
      </View>
    );
  }

  if (name === 'settings') {
    return (
      <View accessible={false} style={{ width: size, height: size, borderRadius: size, borderWidth: stroke, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: color }} />
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
