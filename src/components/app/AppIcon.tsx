import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

export type AppIconName =
  | 'today'
  | 'library'
  | 'review'
  | 'progress'
  | 'add'
  | 'settings'
  | 'calendar'
  | 'chevron'
  | 'checkbox'
  | 'checkbox-checked'
  | 'stopwatch'
  | 'flame'
  | 'target';

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
      <View
        accessible={false}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: arm,
            height: stroke * 1.18,
            borderRadius: stroke,
            backgroundColor: color,
            position: 'absolute',
          }}
        />
        <View
          style={{
            width: stroke * 1.18,
            height: arm,
            borderRadius: stroke,
            backgroundColor: color,
            position: 'absolute',
          }}
        />
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: size * 0.1,
              marginTop: size * 0.14,
            }}>
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size,
                backgroundColor: color,
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (name === 'library') {
    return (
      <View
        accessible={false}
        style={[
          styles.row,
          { width: size, height: size, alignItems: 'center', justifyContent: 'center', gap: size * 0.1 },
        ]}>
        {[0.68, 0.94, 0.72].map((heightRatio, index) => (
          <View
            key={index}
            style={{
              width: size * 0.22,
              height: size * heightRatio,
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
        <View
          style={{
            position: 'absolute',
            left: size * 0.06,
            top: size * 0.24,
            width: size * 0.68,
            height: size * 0.58,
            borderRadius: size * 0.18,
            borderWidth: stroke,
            borderColor: color,
            opacity: 0.55,
          }}
        />
        <View
          style={{
            position: 'absolute',
            right: size * 0.04,
            top: size * 0.08,
            width: size * 0.72,
            height: size * 0.62,
            borderRadius: size * 0.18,
            borderWidth: stroke,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              width: size * 0.34,
              height: stroke,
              borderRadius: stroke,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    );
  }

  if (name === 'progress') {
    return (
      <View
        accessible={false}
        style={[
          styles.row,
          { width: size, height: size, alignItems: 'flex-end', justifyContent: 'center', gap: size * 0.11 },
        ]}>
        {[0.4, 0.66, 0.92].map((height, index) => (
          <View
            key={index}
            style={{
              width: size * 0.18,
              height: size * height,
              borderRadius: size * 0.09,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
    );
  }

  if (name === 'checkbox' || name === 'checkbox-checked') {
    const checked = name === 'checkbox-checked';
    return (
      <View
        accessible={false}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          borderWidth: stroke,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked ? (
          <View
            style={{
              width: size * 0.48,
              height: size * 0.26,
              borderLeftWidth: stroke * 1.15,
              borderBottomWidth: stroke * 1.15,
              borderColor: color,
              transform: [{ rotate: '-45deg' }, { translateY: -size * 0.04 }],
            }}
          />
        ) : null}
      </View>
    );
  }

  if (name === 'stopwatch') {
    const dialSize = size * 0.82;
    return (
      <View
        accessible={false}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View
          style={{
            width: size * 0.34,
            height: stroke,
            borderRadius: stroke,
            backgroundColor: color,
            marginBottom: 1,
          }}
        />
        <View
          style={{
            width: dialSize,
            height: dialSize,
            borderRadius: dialSize / 2,
            borderWidth: stroke,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              width: stroke,
              height: dialSize * 0.34,
              backgroundColor: color,
              borderRadius: stroke,
              transform: [{ rotate: '35deg' }, { translateY: -dialSize * 0.08 }],
            }}
          />
        </View>
      </View>
    );
  }

  if (name === 'flame') {
    return (
      <View
        accessible={false}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: size * 0.68,
            height: size * 0.78,
            borderWidth: stroke,
            borderColor: color,
            borderTopLeftRadius: size * 0.42,
            borderTopRightRadius: size * 0.14,
            borderBottomLeftRadius: size * 0.38,
            borderBottomRightRadius: size * 0.38,
            transform: [{ rotate: '-12deg' }],
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: size * 0.1,
          }}>
          <View
            style={{
              width: size * 0.24,
              height: size * 0.28,
              borderRadius: size * 0.14,
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
        </View>
      </View>
    );
  }

  if (name === 'target') {
    const ring = size * 0.72;
    return (
      <View
        accessible={false}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: size,
            height: stroke,
            backgroundColor: color,
            borderRadius: stroke,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: stroke,
            height: size,
            backgroundColor: color,
            borderRadius: stroke,
          }}
        />
        <View
          style={{
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: stroke,
            borderColor: color,
            backgroundColor: '#F2E7D0',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              width: size * 0.18,
              height: size * 0.18,
              borderRadius: size * 0.09,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    );
  }

  if (name === 'settings') {
    return (
      <View
        accessible={false}
        style={{
          width: size,
          height: size,
          borderRadius: size,
          borderWidth: stroke,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: size * 0.32,
            height: size * 0.32,
            borderRadius: size,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }

  return (
    <View
      accessible={false}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
