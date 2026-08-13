import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

import type { MobileCard } from '@/features/card/types';
import { buildMobileContactQrPayload } from '@/lib/contact-qr-payload';
import { nfcManufacturerPayload, normalizeCardUrl } from '@/lib/nfc-ndef';

export function isNativeNfcSupported() {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export type NfcProgrammingStage =
  | 'checking-device'
  | 'waiting-for-tag'
  | 'reading-tag'
  | 'writing-tag'
  | 'verifying-tag';

export type NfcProgrammingProgress = (stage: NfcProgrammingStage) => void;

function assertCardUrl(cardUrl: string) {
  const normalized = normalizeCardUrl(cardUrl);
  if (!normalized) {
    throw new Error('Publish your card first so we have a link to program onto the tag.');
  }
  return normalized;
}

function sameCardUrl(actual: string, expected: string) {
  try {
    return new URL(actual).href === new URL(expected).href;
  } catch {
    return actual.trim() === expected.trim();
  }
}

function verifiedUriFromTag(
  tag: Awaited<ReturnType<Awaited<ReturnType<typeof loadNfcManager>>['NfcManager']['ndefHandler']['getNdefMessage']>>,
  Ndef: Awaited<ReturnType<typeof loadNfcManager>>['Ndef'],
) {
  const uriRecord = tag?.ndefMessage?.find((record) => {
    const type = record.type;
    const isUriType = typeof type === 'string'
      ? type === 'U'
      : Array.isArray(type) && type.length === 1 && type[0] === 0x55;
    return record.tnf === Ndef.TNF_WELL_KNOWN && isUriType;
  });
  return uriRecord?.payload
    ? Ndef.uri.decodePayload(Uint8Array.from(uriRecord.payload))
    : '';
}

async function loadNfcManager() {
  const NfcManager = (await import('react-native-nfc-manager')).default;
  const { NfcTech, Ndef, NdefStatus } = await import('react-native-nfc-manager');
  return { NfcManager, NfcTech, Ndef, NdefStatus };
}

async function writeNdefMessage(
  NfcManager: Awaited<ReturnType<typeof loadNfcManager>>['NfcManager'],
  NfcTech: Awaited<ReturnType<typeof loadNfcManager>>['NfcTech'],
  Ndef: Awaited<ReturnType<typeof loadNfcManager>>['Ndef'],
  NdefStatus: Awaited<ReturnType<typeof loadNfcManager>>['NdefStatus'],
  bytes: number[],
  expectedUrl: string,
  onProgress?: NfcProgrammingProgress,
) {
  let ndefSessionStarted = false;
  try {
    onProgress?.('waiting-for-tag');
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: 'Hold your phone against one NFC tag and keep it still.',
    });
    ndefSessionStarted = true;
    onProgress?.('reading-tag');
    const status = await NfcManager.ndefHandler.getNdefStatus();
    if (status.status === NdefStatus.NotSupported) {
      throw new Error('This tag does not support the NDEF format used for card links.');
    }
    if (status.status === NdefStatus.ReadOnly) {
      throw new Error('This NFC tag is read-only. Use a writable NDEF tag and try again.');
    }
    if (status.capacity > 0 && bytes.length > status.capacity) {
      throw new Error('This NFC tag does not have enough space for the card link. Try an NTAG213, NTAG215, or NTAG216 tag.');
    }
    onProgress?.('writing-tag');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    onProgress?.('verifying-tag');
    const writtenTag = await NfcManager.ndefHandler.getNdefMessage();
    const writtenUrl = verifiedUriFromTag(writtenTag, Ndef);
    if (!sameCardUrl(writtenUrl, expectedUrl)) {
      throw new Error('The tag was written, but the saved card link could not be verified. Program it again before using it.');
    }
    return;
  } catch (error) {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
    if (ndefSessionStarted || Platform.OS !== 'android' || !NfcTech.NdefFormatable) throw error;
  }

  onProgress?.('waiting-for-tag');
  await NfcManager.requestTechnology(NfcTech.NdefFormatable, {
    alertMessage: 'Hold your phone against the blank NFC tag and keep it still.',
  });
  onProgress?.('reading-tag');
  onProgress?.('writing-tag');
  await NfcManager.ndefFormatableHandlerAndroid.formatNdef(bytes);
  await NfcManager.cancelTechnologyRequest().catch(() => {});

  onProgress?.('waiting-for-tag');
  await NfcManager.requestTechnology(NfcTech.Ndef, {
    alertMessage: 'Hold the tag near your phone once more to verify it.',
  });
  onProgress?.('verifying-tag');
  const writtenTag = await NfcManager.ndefHandler.getNdefMessage();
  const writtenUrl = verifiedUriFromTag(writtenTag, Ndef);
  if (!sameCardUrl(writtenUrl, expectedUrl)) {
    throw new Error('The tag was formatted, but ehllo could not verify the card link. Try programming it again.');
  }
}

function explainNfcFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/read.?only|not writable/i.test(message)) {
    return 'This tag is locked or read-only. Use a new writable NFC tag.';
  }
  if (/capacity|space|too large/i.test(message)) {
    return 'The tag is too small for this card link. Try an NTAG213, NTAG215, or NTAG216 tag.';
  }
  if (/cancel|invalidate|user.*cancel/i.test(message)) {
    return 'Programming was cancelled. Start again, hold one tag near the phone, and keep it still.';
  }
  if (/lost|connect|timeout|transceive|tag.*removed/i.test(message)) {
    return 'The tag moved before programming finished. Remove phone cases if needed, then hold the tag steady and try again.';
  }
  if (/ndef|format/i.test(message)) {
    return Platform.OS === 'ios'
      ? 'This tag is not NDEF-formatted or writable. Try a blank NTAG213, NTAG215, or NTAG216 tag.'
      : 'This tag could not be prepared for an ehllo link. Try a blank NTAG213, NTAG215, or NTAG216 tag.';
  }
  return message || 'ehllo could not program this tag. Hold one writable NFC tag near the phone and try again.';
}

export async function programNfcTag(
  _card: MobileCard,
  cardUrl: string,
  onProgress?: NfcProgrammingProgress,
) {
  if (!isNativeNfcSupported()) {
    throw new Error('NFC programming is only available in the ehllo iOS and Android apps.');
  }

  const normalized = assertCardUrl(cardUrl);
  const { NfcManager, NfcTech, Ndef, NdefStatus } = await loadNfcManager();

  onProgress?.('checking-device');
  const supported = await NfcManager.isSupported();
  if (!supported) throw new Error('This device does not support NFC writing.');

  const enabled = await NfcManager.isEnabled();
  if (!enabled) {
    throw new Error('Turn on NFC in your phone settings, then try again.');
  }

  await NfcManager.start();
  try {
    // A single URI record gives small, inexpensive tags the best chance of
    // succeeding. The public card page owns contact saving and stays current.
    const records = [Ndef.uriRecord(normalized)];
    const bytes = Ndef.encodeMessage(records);
    if (!bytes) throw new Error('Could not encode the NFC message.');
    await writeNdefMessage(NfcManager, NfcTech, Ndef, NdefStatus, bytes, normalized, onProgress);
  } catch (error) {
    throw new Error(explainNfcFailure(error));
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function copyNfcCardLink(cardUrl: string) {
  const normalized = assertCardUrl(cardUrl);
  await Clipboard.setStringAsync(normalized);
  return normalized;
}

export async function copyNfcManufacturerPayload(card: MobileCard, cardUrl: string) {
  const normalized = assertCardUrl(cardUrl);
  const vcard = buildMobileContactQrPayload(card, normalized);
  const payload = JSON.stringify(nfcManufacturerPayload(normalized, vcard), null, 2);
  await Clipboard.setStringAsync(payload);
  return payload;
}

export async function openNfcSettings() {
  if (Platform.OS === 'android') {
    await Linking.sendIntent('android.settings.NFC_SETTINGS').catch(async () => {
      await Linking.openSettings();
    });
    return;
  }
  await Linking.openSettings();
}
