import * as FileSystem from 'expo-file-system/legacy';

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'm4a', 'mp3', 'mp4', 'wav', 'aac', 'caf', 'flac', '3gp', 'amr', 'webm', 'ogg', 'opus', 'mpeg', 'mpga',
]);

export function extensionFromPath(value: string) {
  const decoded = decodeURIComponent(value.split('?')[0] || '');
  const match = /\.([a-z0-9]+)$/i.exec(decoded.trim());
  return match?.[1]?.toLowerCase() || '';
}

const BLOCKED_IMPORT_EXTENSIONS = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'txt', 'doc', 'docx', 'zip', 'csv', 'json',
]);

function mimeToExtension(mimeType?: string) {
  const mime = (mimeType || '').toLowerCase();
  if (!mime) return '';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'm4a';
  return '';
}

export function isSupportedAudioImport(fileName?: string, mimeType?: string, uri?: string) {
  const ext = extensionFromPath(fileName || '') || extensionFromPath(uri || '') || mimeToExtension(mimeType);
  if (ext && BLOCKED_IMPORT_EXTENSIONS.has(ext)) return false;
  if (ext && SUPPORTED_AUDIO_EXTENSIONS.has(ext)) return true;
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('audio/') || mime.startsWith('video/') || mime === 'application/octet-stream') return true;
  // Document picker already filtered the file - default to allow unless clearly not audio.
  return !ext || !BLOCKED_IMPORT_EXTENSIONS.has(ext);
}

function guessMimeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3') || lower.endsWith('.mpeg') || lower.endsWith('.mpga')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.3gp')) return 'audio/3gpp';
  if (lower.endsWith('.amr')) return 'audio/amr';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg';
  if (lower.endsWith('.opus')) return 'audio/opus';
  return '';
}

export function guessRecordingFileName(uri: string, preferredName?: string) {
  if (preferredName?.trim()) return preferredName.trim();
  const ext = extensionFromPath(uri);
  if (ext && SUPPORTED_AUDIO_EXTENSIONS.has(ext)) return `recording.${ext}`;
  return 'recording.m4a';
}

export function guessRecordingMimeType(uri: string, preferredMime?: string, fileName?: string) {
  const normalizedPreferred = normalizeAudioMimeType(preferredMime || '', fileName || uri);
  if (normalizedPreferred) return normalizedPreferred;
  const fromName = fileName ? guessMimeFromFileName(fileName) : '';
  if (fromName) return fromName;
  const fromUri = guessMimeFromFileName(guessRecordingFileName(uri));
  return fromUri || 'audio/mp4';
}

export function normalizeAudioMimeType(mimeType: string, hintPath: string) {
  const lower = mimeType.trim().toLowerCase();
  if (!lower) return guessMimeFromFileName(hintPath) || '';
  if (lower.includes('m4a') || lower === 'audio/x-m4a') return 'audio/mp4';
  if (lower === 'application/octet-stream') return guessMimeFromFileName(hintPath) || 'audio/mp4';
  if (lower.startsWith('audio/') || lower.startsWith('video/')) return lower;
  return guessMimeFromFileName(hintPath) || 'audio/mp4';
}

export const MAX_TRANSCRIBE_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Above this size, base64 JSON exceeds typical server body limits - prefer multipart upload. */
export const MAX_BASE64_TRANSCRIBE_BYTES = 3 * 1024 * 1024;

export type PreparedAudioUpload = {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
};

async function copyAudioToCache(
  uri: string,
  options?: { fileName?: string; mimeType?: string },
): Promise<PreparedAudioUpload> {
  const ext = extensionFromPath(options?.fileName || '')
    || extensionFromPath(uri)
    || mimeToExtension(options?.mimeType)
    || 'm4a';
  const fileName = extensionFromPath(options?.fileName || '')
    ? (options?.fileName || '').trim()
    : `recording.${ext}`;

  const cacheDir = FileSystem.cacheDirectory;
  let uploadUri = uri.trim();
  if (cacheDir) {
    const dest = `${cacheDir}transcribe-${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: uploadUri, to: dest });
    uploadUri = dest;
  }

  const mimeType = guessRecordingMimeType(uploadUri, options?.mimeType, fileName);
  const info = await FileSystem.getInfoAsync(uploadUri);
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (!info.exists) {
    throw new Error('Could not read this audio file from your device.');
  }
  if (size > 0 && size < 128) {
    throw new Error('That audio file looks empty or corrupted.');
  }
  if (size > MAX_TRANSCRIBE_UPLOAD_BYTES) {
    throw new Error('Recording is larger than 25 MB. Choose a shorter or compressed recording.');
  }

  return { uri: uploadUri, fileName, mimeType, size };
}

export async function prepareAudioUpload(
  uri: string,
  options?: { fileName?: string; mimeType?: string },
): Promise<PreparedAudioUpload & { base64: string }> {
  const prepared = await copyAudioToCache(uri, options);
  const base64 = await FileSystem.readAsStringAsync(prepared.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) {
    throw new Error('Could not read this audio file from your device.');
  }

  return { ...prepared, base64 };
}

export async function prepareAudioFile(
  uri: string,
  options?: { fileName?: string; mimeType?: string },
) {
  return copyAudioToCache(uri, options);
}
