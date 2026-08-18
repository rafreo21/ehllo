import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useAppInsets() {
  const insets = useSafeAreaInsets();
  const androidStatusBar = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;

  return {
    top: Math.max(insets.top, androidStatusBar),
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
  };
}

export function useTabBarHeight() {
  const insets = useAppInsets();
  // AppTabBar now floats as an absolute overlay, so this only needs to
  // clear its opaque footprint (item height 52 + vertical padding 6+6) -
  // the transparent marginTop above it is safe for content to reach.
  // The +4 mirrors AppTabBar's own marginBottom bump (extra clearance from
  // Android's gesture bar).
  return 64 + Math.max(insets.bottom, 12) + 4;
}
