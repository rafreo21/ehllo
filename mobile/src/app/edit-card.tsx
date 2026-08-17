import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Image as ImageIcon, Palette, UserCircle, ListChecks } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { CardPublishSheet } from '@/components/card-publish-sheet';
import { MethodListEditor } from '@/components/method-list-editor';
import { MobileCardPreview } from '@/components/mobile-card';
import { Body, Button, FooterBackButton, PageHeader } from '@/components/ui';
import { cardDraftSignature, cardNeedsPublish } from '@/lib/card-draft';
import { describeError } from '@/lib/friendly-error';
import {
  ensurePublishedBaseline,
  writePublishedBaseline,
} from '@/lib/published-baseline';
import { useAppInsets } from '@/lib/safe-area';
import { useCard } from '@/features/card/card-context';
import { describePublishError } from '@/features/card/publish-card';
import { setAuthReturnPath } from '@/features/encounters/capture-draft';
import { CardThemeGradient, CardThemeGradientFill } from '@/components/card-theme-gradient';
import { CARD_THEMES, normalizeThemeColor, themeForegroundColor, themeMatches } from '@/features/card/theme-colors';
import type { MobileCard } from '@/features/card/types';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

const STEPS = ['Design', 'Methods', 'Review'] as const;

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string; icon?: ReactNode }>) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        {icon ? <View style={styles.sectionIcon}>{icon}</View> : null}
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function StepIndicator({
  current,
  onStep,
}: {
  current: number;
  onStep: (index: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperTrack}>
        {STEPS.map((label, index) => {
          const active = index === current;
          const done = index < current;
          const leftLineActive = index > 0 && current >= index;
          const rightLineActive = index < STEPS.length - 1 && current > index;

          return (
            <View key={label} style={styles.stepperSegment}>
              <View style={[styles.stepperLine, index === 0 && styles.stepperLineHidden, leftLineActive && styles.stepperLineActive]} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onStep(index)}
                style={[
                  styles.stepperDot,
                  active && styles.stepperDotActive,
                  done && styles.stepperDotDone,
                ]}>
                {done ? (
                  <Check size={14} color={colors.ink} weight="bold" />
                ) : (
                  <Text style={[styles.stepperNum, active && styles.stepperNumActive]}>{index + 1}</Text>
                )}
              </Pressable>
              <View style={[styles.stepperLine, index === STEPS.length - 1 && styles.stepperLineHidden, rightLineActive && styles.stepperLineActive]} />
            </View>
          );
        })}
      </View>

      <View style={styles.stepperLabels}>
        {STEPS.map((label, index) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            onPress={() => onStep(index)}
            style={styles.stepperLabelCell}>
            <Text style={[styles.stepperLabel, index === current && styles.stepperLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { card, getCardById, updateCardById, publishCard, publishing } = useCard();
  const source = useMemo(
    () => (id ? getCardById(id) : undefined) || card,
    [card, getCardById, id],
  );
  const [draft, setDraft] = useState<MobileCard>(source);
  const [publishedBaseline, setPublishedBaseline] = useState<string | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [step, setStep] = useState(0);
  const [sheet, setSheet] = useState<'none' | 'success' | 'error'>('none');
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetMessage, setSheetMessage] = useState('');
  const [sheetDetail, setSheetDetail] = useState('');
  const [localPublishing, setLocalPublishing] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<MobileCard | null>(null);
  const initializedCardId = useRef<string | null>(null);
  const insets = useAppInsets();

  useEffect(() => {
    if (!id) return;
    const next = getCardById(id);
    if (!next) return;

    if (initializedCardId.current !== id) {
      initializedCardId.current = id;
      setDraft(next);
      setBaselineReady(false);
      void ensurePublishedBaseline(next).then((baseline) => {
        setPublishedBaseline(baseline);
        setBaselineReady(true);
      });
    }
  }, [getCardById, id]);

  const isDirty = baselineReady && cardNeedsPublish(draft, publishedBaseline);
  const canPublish = baselineReady && (draft.status !== 'published' || isDirty);
  const isPublishing = publishing || localPublishing;

  const persistLocal = useCallback((updater: MobileCard | ((current: MobileCard) => MobileCard)) => {
    setDraft((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      const normalized = { ...next, theme: normalizeThemeColor(next.theme) };
      pendingDraft.current = normalized;

      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        persistTimer.current = null;
        const pending = pendingDraft.current;
        if (!pending?.id) return;
        void updateCardById(pending.id, pending);
        pendingDraft.current = null;
      }, 700);

      return normalized;
    });
  }, [updateCardById]);

  const flushPersist = useCallback(async () => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const next = pendingDraft.current ?? draft;
    pendingDraft.current = null;
    if (next.id) await updateCardById(next.id, next);
  }, [draft, updateCardById]);

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
  }, []);

  function updateField<K extends keyof MobileCard>(key: K, value: MobileCard[K]) {
    persistLocal({ ...draft, [key]: value });
  }

  async function pickImage(key: 'photo' | 'companyLogo' | 'coverPhoto') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: key === 'coverPhoto' ? [16, 9] : [1, 1],
      quality: 0.82,
    });
    if (!result.canceled) updateField(key, result.assets[0].uri);
  }

  const needsSignIn = sheetTitle === 'Sign in required';

  async function goSignInToPublish() {
    closeSheet();
    const cardId = draft.id || id;
    await setAuthReturnPath(cardId ? `/edit-card?id=${encodeURIComponent(cardId)}` : '/edit-card');
    router.push('/auth');
  }

  async function publish() {
    if (isPublishing || !canPublish) return;

    setLocalPublishing(true);
    setSheet('none');
    setSheetTitle('');
    setSheetMessage('');
    setSheetDetail('');

    try {
      await flushPersist();
      const result = await publishCard(draft.id, draft);
      if (result.ok) {
        const publishedSnapshot = cardDraftSignature({ ...draft, status: 'published' });
        await writePublishedBaseline({ ...draft, status: 'published' });
        setPublishedBaseline(publishedSnapshot);
        setSheetTitle('Card published');
        setSheetMessage('Your card is live. Share the link, QR code, or open Card Tools for wallet and widgets.');
        setSheetDetail(result.publicUrl);
        setSheet('success');
        return;
      }
      setSheetTitle(result.title);
      setSheetMessage(result.message);
      setSheetDetail(result.detail || '');
      setSheet('error');
    } catch (error) {
      const message = describeError(error, 'Something went wrong.');
      const failure = describePublishError(message);
      setSheetTitle(failure.title);
      setSheetMessage(failure.message);
      setSheetDetail(failure.detail || message);
      setSheet('error');
    } finally {
      setLocalPublishing(false);
    }
  }

  function closeSheet() {
    setSheet('none');
  }

  function finishAfterSuccess() {
    setSheet('none');
    router.back();
  }

  function openCardToolsAfterPublish() {
    setSheet('none');
    router.replace(`/card-tools?id=${draft.id}`);
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2, paddingBottom: insets.bottom }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <PageHeader
            eyebrow="Card editor"
            title={draft.label || 'Edit card'}
            titleStyle={styles.title}
          />
        </View>

        <View style={styles.stepperWrap}>
          <StepIndicator current={step} onStep={setStep} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {step === 0 ? (
            <View style={styles.stepContent}>
              <SectionCard
                title="Photos"
                subtitle="Help people recognise you instantly"
                icon={<ImageIcon size={18} color={colors.ink} weight="bold" />}>
                <View style={styles.coverWrap}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pickImage('coverPhoto')}
                    style={[styles.coverSlot, draft.coverPhoto && styles.coverSlotFilled]}>
                    {draft.coverPhoto ? (
                      <>
                        <Image alt="Cover photo preview" source={draft.coverPhoto} style={styles.coverImage} contentFit="cover" />
                        <View style={styles.imageOverlay}>
                          <Text style={styles.overlayText}>Change cover</Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={28} color={colors.muted} weight="bold" />
                        <Text style={styles.coverLabel}>Add cover photo</Text>
                        <Text style={styles.coverHint}>Wide banner · 16:9</Text>
                      </>
                    )}
                  </Pressable>
                  {draft.coverPhoto ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => updateField('coverPhoto', '')}
                      style={styles.removeBadge}>
                      <Text style={styles.removeImage}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.photoRow}>
                  {([
                    ['photo', 'Profile photo'],
                    ['companyLogo', 'Company logo'],
                  ] as const).map(([key, label]) => (
                    <View key={key} style={styles.photoWrap}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void pickImage(key)}
                        style={[styles.photoSlot, draft[key] && styles.photoSlotFilled]}>
                        {draft[key] ? (
                          <>
                            <Image alt={`${label} preview`} source={draft[key]} style={styles.photoPreview} contentFit="cover" />
                            <View style={styles.imageOverlay}>
                              <Text style={styles.overlayTextSmall}>Change</Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={styles.photoIconWrap}>
                              <ImageIcon size={22} color={colors.ink} weight="bold" />
                            </View>
                            <Text style={styles.photoHint}>Tap to upload</Text>
                          </>
                        )}
                      </Pressable>
                      <Text style={styles.photoLabel}>{label}</Text>
                      {draft[key] ? (
                        <Pressable accessibilityRole="button" onPress={() => updateField(key, '')}>
                          <Text style={styles.removeImage}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              </SectionCard>

              <SectionCard
                title="Your details"
                subtitle="What appears on the card"
                icon={<UserCircle size={18} color={colors.ink} weight="bold" />}>
                {([
                  ['label', 'Card label', 'e.g. Work card'],
                  ['name', 'Full name', 'Your name'],
                  ['role', 'Job title', 'What you do'],
                  ['company', 'Company', 'Where you work'],
                ] as const).map(([key, label, placeholder]) => (
                  <View key={key} style={styles.field}>
                    <Text style={styles.label}>{label}</Text>
                    <TextInput
                      value={draft[key]}
                      onChangeText={(value) => updateField(key, value)}
                      placeholder={placeholder}
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                    />
                  </View>
                ))}

                <View style={styles.field}>
                  <Text style={styles.label}>Short introduction</Text>
                  <TextInput
                    value={draft.bio}
                    onChangeText={(value) => updateField('bio', value.slice(0, 180))}
                    placeholder="A quick line about you"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={[styles.input, styles.textarea]}
                  />
                  <Text style={styles.hint}>{draft.bio.length}/180</Text>
                </View>
              </SectionCard>

              <SectionCard
                title="Card colour"
                subtitle="Pick a theme that matches your brand"
                icon={<Palette size={18} color={colors.ink} weight="bold" />}>
                <View style={styles.swatches}>
                  {CARD_THEMES.map((theme) => (
                    <Pressable
                      accessibilityLabel={`Use ${theme}`}
                      key={theme}
                      onPress={() => updateField('theme', theme)}
                      style={[
                        styles.swatch,
                        themeMatches(draft.theme, theme) && styles.swatchSelected,
                      ]}>
                      <CardThemeGradientFill theme={theme} />
                      {themeMatches(draft.theme, theme) ? (
                        <Check size={18} color={themeForegroundColor(theme)} weight="bold" />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </SectionCard>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.stepContent}>
              <SectionCard
                title="Contact methods"
                subtitle="Add the ways people can reach you"
                icon={<ListChecks size={18} color={colors.ink} weight="bold" />}>
                <MethodListEditor
                  methods={draft.methods}
                  onChange={(methods) => persistLocal((current) => ({ ...current, methods }))}
                />
              </SectionCard>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.stepContent}>
              <View style={styles.reviewIntro}>
                <Text style={styles.reviewTitle}>Almost there</Text>
                <Body>Preview your card below, then publish when you are ready to share.</Body>
              </View>

              <View style={styles.previewWrap}>
                <MobileCardPreview card={draft} />
              </View>

              <View style={styles.reviewStats}>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{draft.methods.length}</Text>
                  <Text style={styles.statLabel}>Methods</Text>
                </View>
                <View style={styles.statPill}>
                  <CardThemeGradient theme={normalizeThemeColor(draft.theme)} style={styles.statSwatch} />
                  <Text style={styles.statLabel}>Theme</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{draft.status === 'published' ? 'Live' : 'Draft'}</Text>
                  <Text style={styles.statLabel}>Status</Text>
                </View>
              </View>

              <View style={styles.reviewOption}>
                <View style={styles.reviewOptionCopy}>
                  <Text style={styles.reviewOptionTitle}>Company details</Text>
                  <Text style={styles.reviewOptionHint}>Show your logo, company name, and website on the card</Text>
                </View>
                <Switch
                  accessibilityLabel="Show company details"
                  value={draft.showCompanyDetails !== false}
                  onValueChange={(value) => updateField('showCompanyDetails', value)}
                  trackColor={{ false: colors.line, true: colors.accent }}
                  thumbColor={colors.surface}
                />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {step > 0 ? <FooterBackButton onPress={() => setStep(step - 1)} /> : null}
          {step < 2 ? (
            <Button style={{ flex: 1 }} onPress={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button
              style={{ flex: 1 }}
              loading={isPublishing}
              disabled={!canPublish || isPublishing}
              onPress={() => void publish()}>
              {draft.status === 'published' && !isDirty ? 'Up to date' : 'Save and publish'}
            </Button>
          )}
        </View>
      </View>

      <CardPublishSheet
        visible={sheet === 'success'}
        variant="success"
        title={sheetTitle || 'Card published'}
        message={sheetMessage}
        detail={sheetDetail}
        primaryLabel="Done"
        secondaryLabel="Open card tools"
        onPrimary={finishAfterSuccess}
        onSecondary={openCardToolsAfterPublish}
        onClose={finishAfterSuccess}
      />

      <CardPublishSheet
        visible={sheet === 'error'}
        variant="error"
        title={sheetTitle || 'Publish failed'}
        message={sheetMessage}
        detail={sheetDetail}
        primaryLabel={needsSignIn ? 'Sign in' : 'Try again'}
        secondaryLabel="Close"
        onPrimary={() => {
          if (needsSignIn) {
            void goSignInToPublish();
            return;
          }
          closeSheet();
          void publish();
        }}
        onSecondary={closeSheet}
        onClose={closeSheet}
        loading={isPublishing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1 },
  header: { paddingHorizontal: spacing.x5 },
  title: { fontFamily: fonts.regular, fontSize: 32, lineHeight: 34, letterSpacing: -1.1 },
  stepperWrap: {
    marginTop: spacing.x5,
    paddingHorizontal: spacing.x5,
  },
  stepper: { gap: spacing.x3 },
  stepperTrack: { flexDirection: 'row', alignItems: 'center' },
  stepperSegment: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
    borderRadius: 1,
  },
  stepperLineHidden: { opacity: 0 },
  stepperLineActive: { backgroundColor: colors.accent },
  stepperDot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  stepperDotActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  stepperDotDone: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  stepperNum: { color: colors.muted, fontSize: 13, fontFamily: fonts.extrabold, fontWeight: '900' },
  stepperNumActive: { color: colors.white },
  stepperLabels: { flexDirection: 'row' },
  stepperLabelCell: { flex: 1, alignItems: 'center' },
  stepperLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  stepperLabelActive: { color: colors.ink },
  scroll: { flex: 1, marginTop: spacing.x4 },
  scrollContent: {
    paddingHorizontal: spacing.x5,
    paddingBottom: spacing.x6,
  },
  stepContent: { gap: spacing.x4 },
  sectionCard: {
    gap: spacing.x4,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  sectionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  sectionCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, fontWeight: '800' },
  sectionSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  coverWrap: { gap: spacing.x2 },
  coverSlot: {
    minHeight: 148,
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    borderRadius: radius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  coverSlotFilled: {
    borderStyle: 'solid',
    borderColor: colors.line,
  },
  coverImage: {
    ...StyleSheet.absoluteFill,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 51, 0, 0.28)',
  },
  overlayText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  overlayTextSmall: { color: colors.white, fontSize: 12, fontFamily: fonts.bold, fontWeight: '800' },
  coverLabel: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  coverHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  removeBadge: { alignSelf: 'flex-start' },
  photoRow: { flexDirection: 'row', gap: spacing.x3 },
  photoWrap: { flex: 1, alignItems: 'center', gap: spacing.x2 },
  photoSlot: {
    width: '100%',
    aspectRatio: 1,
    padding: spacing.x4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    overflow: 'hidden',
  },
  photoSlotFilled: {
    padding: 0,
    borderStyle: 'solid',
  },
  photoPreview: {
    ...StyleSheet.absoluteFill,
  },
  photoIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  photoLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  photoHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  removeImage: { color: colors.danger, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700' },
  field: { gap: spacing.x2 },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 16,
  },
  textarea: { minHeight: 110, paddingTop: spacing.x4, textAlignVertical: 'top' },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: 'right' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 },
  swatch: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
  },
  swatchSelected: { borderWidth: 2, borderColor: colors.ink },
  reviewIntro: { gap: spacing.x2, paddingHorizontal: spacing.x1 },
  reviewTitle: { color: colors.ink, fontSize: 22, fontFamily: fonts.bold, fontWeight: '800', letterSpacing: -0.5 },
  previewWrap: {
    paddingVertical: spacing.x2,
  },
  reviewStats: {
    flexDirection: 'row',
    gap: spacing.x3,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.x2,
    paddingVertical: spacing.x4,
    paddingHorizontal: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  statValue: { color: colors.ink, fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '900' },
  statSwatch: {
    width: 28,
    height: 28,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontWeight: '700', textTransform: 'uppercase' },
  reviewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x4,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  reviewOptionCopy: { flex: 1, gap: 4 },
  reviewOptionTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  reviewOptionHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    gap: spacing.x2,
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x3,
    paddingBottom: spacing.x2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
});
