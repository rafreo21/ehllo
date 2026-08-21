import type { PropsWithChildren, ReactNode } from 'react';
import { ArrowLeft, X } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  /** Shows a back icon beside the title instead of a separate row - for a multi-step sheet stepping back to a previous screen rather than closing. */
  onBack?: () => void;
}>;

export function BottomSheet({ visible, title, onClose, footer, onBack, children }: BottomSheetProps) {
  const insets = useAppInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) {
      void Promise.resolve().then(() => setKeyboardHeight(0));
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  // Lift the whole sheet above the keyboard. Modal windows on Android do not
  // resize with softwareKeyboardLayoutMode, so padding must live on this root.
  const lift = Math.max(0, keyboardHeight);
  const sheetMaxHeight = Math.min(
    windowHeight * 0.82,
    Math.max(280, windowHeight - lift - Math.max(insets.top, spacing.x4) - spacing.x4),
  );
  // react-native-safe-area-context reports insets.bottom as 0 for content
  // inside a core RN <Modal> on Android - it's a separate native window from
  // the rest of the app, so the real nav-bar inset measured at the app root
  // never reaches in here (confirmed: a standard 3-button nav bar measures
  // 48dp on-device, but insets.bottom reads 0 inside this Modal). Screens
  // built on ScreenFrame/Screen instead of a core Modal don't have this
  // problem and just use insets.bottom + spacing.x5 - this floor matches
  // that same total so every sheet clears the nav bar by the same amount.
  const sheetPaddingBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 68 : spacing.x4);

  // Keep the focused field reachable after the sheet resizes for the keyboard.
  // Avoid measureLayout - Fabric requires a native host ref and ScrollView is not one.
  useEffect(() => {
    if (!visible || lift <= 0) return;

    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 60 : 120);

    return () => clearTimeout(timer);
  }, [lift, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: lift }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxHeight,
              // Force a bounded height while the keyboard is open so ScrollView can scroll.
              height: lift > 0 ? sheetMaxHeight : undefined,
              paddingBottom: sheetPaddingBottom,
            },
          ]}>
          <View style={styles.handle} />
          {/* Close on its own row at the top right, title on the next line from the left.
              They used to share one row, so a long title squeezed against the word "Close"
              and the two competed for the same space. Now the title gets the full width and
              the way out is always in the same corner, whatever the sheet is called. */}
          <View style={styles.headerRow}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={onBack}
                hitSlop={12}
                style={styles.backButton}>
                <ArrowLeft size={18} color={colors.ink} weight="bold" />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              hitSlop={12}
              style={styles.closeButton}>
              <X size={18} color={colors.ink} weight="bold" />
            </Pressable>
          </View>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <View style={styles.bodyWrap}>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              bounces={false}>
              {children}
            </ScrollView>
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(22, 51, 0, 0.48)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    width: '100%',
    paddingTop: spacing.x3,
    paddingHorizontal: spacing.x5,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    marginBottom: spacing.x4,
    borderRadius: radius.round,
    backgroundColor: colors.line,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Back on the left when there is one, close always on the right.
    justifyContent: 'space-between',
  },
  backButton: { flexShrink: 0 },
  // Pushed right on its own when there is no back button, so the close icon does not drift
  // to the left edge on a single-step sheet.
  closeButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
    fontFamily: fonts.bold,
    fontWeight: '800',
    marginTop: spacing.x2,
    marginBottom: spacing.x4,
  },
  bodyWrap: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scroll: {
    flexGrow: 1,
  },
  body: {
    gap: spacing.x4,
    paddingBottom: spacing.x2,
    flexGrow: 1,
  },
  footer: {
    marginTop: spacing.x4,
    paddingTop: spacing.x2,
    gap: spacing.x2,
  },
});
