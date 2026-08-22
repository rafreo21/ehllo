import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { PixelRatio, Platform } from 'react-native';
import logoAsset from '../../assets/images/splash-icon.png';
import { requestQrDataUrl } from '@/lib/widget-qr-renderer';
import { getWritableAppleWidgetGroup } from '@/lib/widget-assets';
function qrFileName(fileKey: string) {
  const safeKey = fileKey.replace(/[^a-zA-Z0-9_-]/g, '') || 'primary';
  return `quick-share-qr-${safeKey}.png`;
}

export const QR_LOGO = logoAsset;

/**
 * How many pixels wide the finished QR should be.
 *
 * WidgetKit refuses to archive a widget whose images are too large, and it fails the whole
 * render rather than dropping the image: a small widget caps out around 986 points on a side
 * and just over a million pixels of area. Asking for 512 produced a 1536x1536 file - the
 * rasterizer works in device pixels, so a 3x screen tripled it - and every render died with
 * `ArchivingError.imageTooLarge`, which WidgetKit reports by falling back to the placeholder.
 * That is why the QR and Business Card widgets showed grey bars while Recent Connections,
 * which has no image, rendered perfectly.
 *
 * 480 is comfortably inside the limit and still well above what is displayed: the code is
 * drawn at 104 points, which is 312 pixels on a 3x screen.
 */
const QR_TARGET_PIXELS = 480;

export async function buildWidgetQrFileUri(cardUrl: string, fileKey = 'primary') {
  const QR_FILE_NAME = qrFileName(fileKey);
  // Probe before rendering the QR. If iOS has not mounted the App Group, generating a raster
  // we cannot store only adds memory/CPU pressure and then produces another native failure.
  const appleGroup = Platform.OS === 'ios' ? await getWritableAppleWidgetGroup() : undefined;
  if (Platform.OS === 'ios' && !appleGroup) return undefined;
  // Divided by the pixel ratio because the rasterizer treats this as points and multiplies by
  // the screen scale. Asking in pixels and letting it triple was the bug.
  const requestedSize = Math.max(120, Math.round(QR_TARGET_PIXELS / PixelRatio.get()));
  // The `qrcode` npm package's toDataURL resolves to a canvas-based renderer
  // that doesn't exist in Hermes/React Native and throws there - generate via
  // react-native-svg's native rasterizer (see widget-qr-renderer.tsx) instead.
  const base64 = await requestQrDataUrl(cardUrl, requestedSize, { color: '#163300', backgroundColor: '#FFFFFF' });

  if (Platform.OS === 'ios') {
    if (appleGroup) {
      const file = new File(appleGroup, QR_FILE_NAME);
      await FileSystem.writeAsStringAsync(file.uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return file.uri;
    }
    // No App Group, no usable path. This used to fall through to the cache directory below -
    // which lives in the APP's sandbox and the widget extension cannot read. The widget was
    // handed a path that looked perfectly valid, failed to load it, and drew its white card
    // with nothing inside: the "widgets are all white" report. Returning nothing is far better,
    // because "no code yet" is a state the widget renders on purpose.
    return undefined;
  }

  const path = `${FileSystem.cacheDirectory}${QR_FILE_NAME}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}
