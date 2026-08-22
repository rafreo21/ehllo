import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import logoAsset from '../../assets/images/splash-icon.png';

import { isRemoteImageUrl } from '@/lib/card-assets-client';

const IOS_APP_GROUPS = ['group.com.ehllo.app.staging', 'group.com.ehllo.app'];

function configuredAppleWidgetGroup() {
  return IOS_APP_GROUPS
    .map((id) => Paths.appleSharedContainers?.[id])
    .find((group) => typeof group?.uri === 'string' && group.uri.length > 0);
}

let writableAppleWidgetGroupProbe: Promise<ReturnType<typeof configuredAppleWidgetGroup>> | undefined;

/**
 * `Paths.appleSharedContainers[id]` being truthy does not prove that iOS actually mounted a
 * writable App Group container. A real iOS 16 device returned an object here while the native
 * `containerURL(forSecurityApplicationGroupIdentifier:)` lookup used by expo-modules-core had
 * resolved nil; every later asset write then failed independently and one path eventually
 * passed an undefined URI into a native String argument.
 *
 * Probe once per app launch. A failed probe deliberately resolves to undefined and is cached:
 * the widget can still receive its text/layout snapshot and render a useful initials/sign-in
 * state, while six asset paths do not repeat the same native exception and Sentry event.
 */
export async function getWritableAppleWidgetGroup() {
  if (Platform.OS !== 'ios') return undefined;
  if (writableAppleWidgetGroupProbe) return writableAppleWidgetGroupProbe;

  writableAppleWidgetGroupProbe = (async () => {
    const group = configuredAppleWidgetGroup();
    if (!group) return undefined;
    const probe = new File(group, `.ehllo-widget-probe-${Date.now()}`);
    try {
      await FileSystem.writeAsStringAsync(probe.uri, 'ok');
      await FileSystem.deleteAsync(probe.uri, { idempotent: true }).catch(() => undefined);
      return group;
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      console.warn('[widget-assets] App Group is unavailable', { message: error.message });
      Sentry.captureException(error, {
        level: 'warning',
        tags: { widget_asset_step: 'app group probe' },
      });
      return undefined;
    }
  })();

  return writableAppleWidgetGroupProbe;
}
// Versioned, not just 'widget-logo.png': ensureWidgetLogoUri skips the copy entirely when a
// file already exists at this name (see the existing.exists check below), so a device that
// cached the old, full-resolution logo before the downsizing below was added would keep
// serving that oversized file forever - the exact bug this file exists to fix, permanently
// stuck for exactly the installs that already hit it. A new name forces one fresh, downsized
// write on next sync and is inert after that.
const LOGO_FILE = 'widget-logo-v2.png';
function photoFileName(fileKey: string) {
  const safeKey = fileKey.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  return `widget-photo-${safeKey}.png`;
}

// The widest an avatar is ever drawn is 40pt (BusinessCardWidget) - 120px at 3x. 160 leaves
// headroom without ever approaching real-device WidgetKit's memory ceiling.
//
// @expo/ui's <Image uiImage={...}> (ImageView.swift) loads the file with
// `Data(contentsOf:)` + `UIImage(data:)` - a full decode at native resolution, no
// downsampling. A source photo straight off a phone (3000-4000px) decodes to 40-60MB of
// RGBA; a widget extension on real hardware gets killed by the OS well before that, with no
// crash and no error - it just fails to produce a snapshot. That is invisible on the
// Simulator, which enforces no such limit, and it is why every real device blanked out
// while every simulator run looked fine: this made every photo an unconditional memory
// bomb, not an occasional one.
const WIDGET_PHOTO_MAX_WIDTH = 160;

/**
 * Downscales whatever is at `uri` to a widget-safe PNG. Returns undefined - never the
 * original, full-size file - on any failure, so a resize that cannot run never falls back
 * to the exact file size this exists to keep out of the widget extension's memory budget.
 *
 * PNG rather than JPEG, for both photos and the logo: at a 160px/128px target the size
 * difference against a photographic JPEG is a few tens of KB, and PNG is lossless, so a
 * transparent source - the logo always, and occasionally someone's own uploaded "photo" -
 * never gets flattened onto an unwanted matte the way a forced JPEG re-encode would.
 */
async function downsizeForWidget(uri: string, width = WIDGET_PHOTO_MAX_WIDTH): Promise<string | undefined> {
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const rendered = await ImageManipulator.manipulate(uri)
      .resize({ width })
      .renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.PNG });
    return result.uri;
  } catch {
    return undefined;
  }
}

export async function readUriAsBase64(uri: string) {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } catch {
    return undefined;
  }
}

export async function ensureWidgetLogoUri() {
  const group = Platform.OS === 'ios' ? await getWritableAppleWidgetGroup() : undefined;
  const directory = Platform.OS === 'ios' ? group?.uri : FileSystem.cacheDirectory;
  if (!directory) return undefined;
  // On iOS the widget can only read the shared App Group container. Without it, anything we
  // write goes to the app's own sandbox and the extension silently fails to load it - so the
  // avatar vanishes with no error rather than falling back to the initials circle.
  if (Platform.OS === 'ios' && !group) return undefined;

  const destination = `${directory}${LOGO_FILE}`;
  const existing = await FileSystem.getInfoAsync(destination);
  if (existing.exists) return destination;

  const asset = Asset.fromModule(logoAsset);
  await asset.downloadAsync();
  if (!asset.localUri) return undefined;

  // Drawn at a 20-26pt ring on every widget; the bundled splash mark is full app-icon
  // resolution. Downsized for the same reason as photos - see WIDGET_PHOTO_MAX_WIDTH.
  const resizedLogo = await downsizeForWidget(asset.localUri, 128);
  const source = resizedLogo || asset.localUri;

  if (Platform.OS === 'ios') {
    if (group) {
      const file = new File(group, LOGO_FILE);
      await FileSystem.copyAsync({ from: source, to: file.uri });
      if (resizedLogo) await FileSystem.deleteAsync(resizedLogo, { idempotent: true });
      return file.uri;
    }
  }

  await FileSystem.copyAsync({ from: source, to: destination });
  if (resizedLogo) await FileSystem.deleteAsync(resizedLogo, { idempotent: true });
  return destination;
}

/**
 * Fetches (or copies) `photo` to a scratch path in the app's own sandbox - never the shared
 * container - so a source this large never touches the App Group even transiently.
 *
 * The scratch name carries a random suffix rather than just `photoFile`, which repeats
 * across calls for the same card/connection. syncAllWidgets has no lock around it and is
 * fired from more than one screen (see card-tools.tsx and card-context.tsx) - two syncs for
 * the same person can genuinely overlap, and a shared, deterministic scratch name meant one
 * call's cleanup delete could remove the file the other call was mid-resize on. Losing that
 * race now just drops one photo for one sync pass (initials fallback), not a shared file.
 */
async function stageSourcePhoto(trimmed: string, photoFile: string): Promise<string | undefined> {
  const nonce = Math.random().toString(36).slice(2, 8);
  const scratch = `${FileSystem.cacheDirectory}source-${nonce}-${photoFile}`;
  if (isRemoteImageUrl(trimmed)) {
    await FileSystem.downloadAsync(trimmed, scratch);
    return scratch;
  }
  if (trimmed.startsWith('file://') || trimmed.startsWith('content://')) {
    await FileSystem.copyAsync({ from: trimmed, to: scratch });
    return scratch;
  }
  return undefined;
}

export async function cacheWidgetPhotoUri(photo: string, fileKey = 'default') {
  const trimmed = photo.trim();
  if (!trimmed) return undefined;

  const group = Platform.OS === 'ios' ? await getWritableAppleWidgetGroup() : undefined;
  const directory = Platform.OS === 'ios' ? group?.uri : FileSystem.cacheDirectory;
  if (!directory) return undefined;

  const PHOTO_FILE = photoFileName(fileKey);
  const destination = `${directory}${PHOTO_FILE}`;

  try {
    const staged = await stageSourcePhoto(trimmed, PHOTO_FILE);
    if (!staged) return undefined;

    // Downscaled before it ever reaches the App Group container - see WIDGET_PHOTO_MAX_WIDTH.
    // A resize failure returns undefined here rather than falling through to the full-size
    // `staged` file, which would put the exact memory bomb this exists to prevent onto a
    // real device's home screen.
    const resized = await downsizeForWidget(staged);
    await FileSystem.deleteAsync(staged, { idempotent: true });
    if (!resized) return undefined;

    if (Platform.OS === 'ios') {
      if (group) {
        const file = new File(group, PHOTO_FILE);
        await FileSystem.copyAsync({ from: resized, to: file.uri });
        await FileSystem.deleteAsync(resized, { idempotent: true });
        return file.uri;
      }
    }
    await FileSystem.copyAsync({ from: resized, to: destination });
    await FileSystem.deleteAsync(resized, { idempotent: true });
    return destination;
  } catch {
    return undefined;
  }
}

export async function cacheWidgetPhotoBase64(photo: string) {
  const uri = await cacheWidgetPhotoUri(photo);
  if (!uri) return undefined;
  return readUriAsBase64(uri);
}
