import type { PropsWithChildren, ReactNode } from 'react';
import { ArrowLeft } from 'phosphor-react-native';
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
import { colors, radius, spacing } from '@/theme/tokens';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  /** Shows a back icon beside the title instead of a separate row — for a multi-step sheet stepping back to a previous screen rather than closing. */
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
  const sheetPaddingBottom = Math.max(insets.bottom, spacing.x4);

  // Keep the focused field reachable after the sheet resizes for the keyboard.
  // Avoid measureLayout — Fabric requires a native host ref and ScrollView is not one.
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
          <View style={styles.header}>
            <View style={styles.headerLeft}>
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
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.x4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2, flexShrink: 1 },
  backButton: { flexShrink: 0 },
  title: { color: colors.ink, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  close: { color: colors.muted, fontSize: 14, fontWeight: '700' },
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
