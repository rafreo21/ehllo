import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import logoAsset from '../../assets/images/splash-icon.png';
import { requestQrDataUrl } from '@/lib/widget-qr-renderer';

const IOS_APP_GROUPS = ['group.com.ehllo.app.staging', 'group.com.ehllo.app'];

function appleWidgetGroup() {
  return IOS_APP_GROUPS.map((id) => Paths.appleSharedContainers?.[id]).find(Boolean);
}
function qrFileName(fileKey: string) {
  const safeKey = fileKey.replace(/[^a-zA-Z0-9_-]/g, '') || 'primary';
  return `quick-share-qr-${safeKey}.png`;
}

export const QR_LOGO = logoAsset;

export async function buildWidgetQrFileUri(cardUrl: string, fileKey = 'primary') {
  const QR_FILE_NAME = qrFileName(fileKey);
  // The `qrcode` npm package's toDataURL resolves to a canvas-based renderer
  // that doesn't exist in Hermes/React Native and throws there - generate via
  // react-native-svg's native rasterizer (see widget-qr-renderer.tsx) instead.
  const base64 = await requestQrDataUrl(cardUrl, 512, { color: '#163300', backgroundColor: '#FFFFFF' });

  if (Platform.OS === 'ios') {
    const group = appleWidgetGroup();
    if (group) {
      const file = new File(group, QR_FILE_NAME);
      await FileSystem.writeAsStringAsync(file.uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return file.uri;
    }
  }

  const path = `${FileSystem.cacheDirectory}${QR_FILE_NAME}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}
