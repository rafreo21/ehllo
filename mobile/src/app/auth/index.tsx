import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, EnvelopeSimple } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { GoogleIcon } from '@/components/provider-icons';
import { BackButton, Body, Button, Eyebrow, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { consumeAuthReturnPath } from '@/features/encounters/capture-draft';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

// Supabase's dashboard-configured email OTP expiry isn't readable from the
// client - this mirrors what's been observed in testing (~1 minute). Update
// this constant if the actual configured value in Supabase Auth settings
// (Email OTP Expiration) turns out to be different.
const OTP_EXPIRY_SECONDS = 60;

function formatCountdown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function AuthScreen() {
  const { signIn, verifyEmailCode, signInWithGoogle, configured, session } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_EXPIRY_SECONDS);
  // Bumped every time a code is (re)sent, so the countdown restarts even
  // though `step` itself doesn't change on a resend.
  const [codeSentAt, setCodeSentAt] = useState(0);

  useEffect(() => {
    if (step !== 'code') return;
    const interval = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, codeSentAt]);

  useEffect(() => {
    if (!session) return;
    void consumeAuthReturnPath().then((path) => {
      if (path) router.replace(path as '/capture');
      else router.replace('/(tabs)');
    });
  }, [session]);

  async function continueWithGoogle() {
    setGoogleLoading(true);
    setMessage('');
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    if (result.error) setMessage(result.error);
  }

  async function submitEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage('Enter a valid email address.');
    setLoading(true);
    setMessage('');
    const result = await signIn(email);
    setLoading(false);
    if (result.error) {
      autoSubmittedFor.current = '';
      return setMessage(result.error);
    }
    setSecondsLeft(OTP_EXPIRY_SECONDS);
    setStep('code');
    setCodeSentAt((current) => current + 1);
    setMessage('Check your email for your 6-digit sign-in code.');
  }

  // iOS's number-pad has no return key, and on a 4.7" screen the keypad covers
  // "Verify and continue" - so a correctly typed code had no way to be
  // submitted at all. Submitting as soon as six digits are in removes the
  // reach entirely, and is what people expect from a one-time code anyway.
  // The ref guards against the paste-then-edit case firing twice.
  const autoSubmittedFor = useRef('');

  function handleCodeChange(next: string) {
    setCode(next);
    const digits = next.replace(/\D/g, '');
    if (digits.length < 6 || loading) return;
    if (autoSubmittedFor.current === digits) return;
    autoSubmittedFor.current = digits;
    Keyboard.dismiss();
    void submitCode(digits);
  }

  async function submitCode(overrideCode?: string) {
    setLoading(true);
    setMessage('');
    // The auto-submit path passes the digits directly: setCode has not
    // committed yet when onChangeText fires, so reading state here would
    // verify the previous five-digit value.
    const result = await verifyEmailCode(email, overrideCode ?? code);
    setLoading(false);
    if (result.error) return setMessage(result.error);
    void consumeAuthReturnPath().then((path) => {
      if (path) router.replace(path as '/capture');
      else router.replace('/(tabs)');
    });
  }

  return (
    <Screen scroll={false} style={styles.screen} edges={['top', 'bottom']} reserveTabBar={false}>
      <BackButton />
      <View style={styles.brandWrap}>
        <BrandMark size={44} />
      </View>
      <View style={styles.authHeaderCopy}>
        <Eyebrow>Welcome</Eyebrow>
        <Title style={styles.authTitle}>
          {step === 'email' ? 'Sign in or sign up in seconds.' : 'Enter your sign-in code.'}
        </Title>
      </View>
      <Body>
        {step === 'email'
          ? 'We’ll email you a 6-digit sign-in code.'
          : 'Enter the 6-digit code we sent to your email.'}
      </Body>

      {step === 'email' ? (
        <>
          <View style={styles.field}>
            <EnvelopeSimple size={20} color={colors.muted} />
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          </View>
          {message ? <Text style={[styles.message, message.startsWith('Check') && styles.success]}>{message}</Text> : null}
          <Button loading={loading} disabled={!configured} onPress={submitEmail}>
            Continue <ArrowRight size={18} color={colors.white} />
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>
            Continue in preview mode
          </Button>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            variant="secondary"
            loading={googleLoading}
            disabled={!configured}
            onPress={() => void continueWithGoogle()}>
            <GoogleIcon size={18} /> Continue with Google
          </Button>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <TextInput
              autoCapitalize="none"
              autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
              value={code}
              onChangeText={handleCodeChange}
              style={[styles.input, styles.codeInput]}
            />
          </View>
          <Text style={[styles.expiry, secondsLeft === 0 && styles.expiryExpired]}>
            {secondsLeft > 0
              ? `Code expires in ${formatCountdown(secondsLeft)}`
              : 'Code expired. Resend to get a new one.'}
          </Text>
          {message ? <Text style={[styles.message, message.startsWith('Check') && styles.success]}>{message}</Text> : null}
          <Button loading={loading} disabled={!configured || code.replace(/\D/g, '').length < 6} onPress={submitCode}>
            Verify and continue
          </Button>
          <Button variant="ghost" loading={loading} onPress={submitEmail}>
            Resend code
          </Button>
          <Button variant="ghost" onPress={() => { setStep('email'); setCode(''); setMessage(''); }}>
            Use a different email
          </Button>
        </>
      )}

      {!configured && (
        <Text style={styles.config}>
          Authentication will activate after EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are added.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center' },
  brandWrap: { alignItems: 'flex-start', marginBottom: spacing.x2 },
  authHeaderCopy: { gap: spacing.x2 },
  authTitle: { fontFamily: fonts.regular, fontSize: 34, lineHeight: 36, letterSpacing: -1.2 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, fontWeight: '700', textTransform: 'uppercase' },
  field: { minHeight: 54, paddingHorizontal: spacing.x4, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 16 },
  codeInput: { letterSpacing: 8, fontSize: 24, fontFamily: fonts.medium, fontWeight: '700', textAlign: 'center' },
  message: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13 },
  success: { color: colors.ink },
  expiry: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  expiryExpired: { color: colors.danger, fontFamily: fonts.medium, fontWeight: '700' },
  config: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});
