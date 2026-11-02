// A page with the rounded title bar (spec 4.7): back button in a circle, the title
// in the middle on one line. Content goes under it on the `page` color.
// `right` (wave 5, spec 2.6): something on the bar's right (the wallet); the title keeps clear of it.
// `hideBack` (wave 5, спец-друзья 3.3): no back button, e.g. "Create an account" on first start has "Later".
import { router } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/state/store';
import { Icon } from './Icon';
import { Txt } from './Text';
import { elevation } from './tokens';
import { useColors } from './useTheme';

export const PAGE_BAR = 56;

export function Page({ title, children, onBack, right, hideBack = false }: {
  title: string; children: ReactNode; onBack?: () => void; right?: ReactNode; hideBack?: boolean;
}) {
  const c = useColors();
  const { night, t } = useStore();
  const insets = useSafeAreaInsets();
  const [rightW, setRightW] = useState(0);
  const narrow = useWindowDimensions().width < 360;
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View
        style={[
          styles.bar,
          elevation(1, night),
          { height: insets.top + PAGE_BAR, paddingTop: insets.top, backgroundColor: c.header },
          right ? { paddingHorizontal: Math.max(64, rightW + 20) } : null,
          // Nothing on the left: on a narrow phone the title may use that side too.
          right && hideBack && narrow ? { paddingLeft: 16, paddingRight: rightW + 16 } : null,
        ]}
      >
        <Txt variant="title2" numberOfLines={1} ellipsizeMode="tail" style={styles.title} accessibilityRole="header">
          {title}
        </Txt>
        {!hideBack && <Pressable
          onPress={back}
          hitSlop={2}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          style={[styles.back, { top: insets.top + (PAGE_BAR - 44) / 2 }]}
        >
          <View style={[styles.backCircle, { backgroundColor: c.headerButton }]}>
            <Icon name="chevronLeft" size={22} color={c.text} />
          </View>
        </Pressable>}
        {right ? (
          <View style={[styles.right, { top: insets.top }]} onLayout={(e) => setRightW(Math.ceil(e.nativeEvent.layout.width))}>
            {right}
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    justifyContent: 'center',
    paddingHorizontal: 64,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    zIndex: 2,
  },
  title: { textAlign: 'center' },
  back: { position: 'absolute', left: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  right: { position: 'absolute', right: 12, height: PAGE_BAR, justifyContent: 'center' },
  backCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
