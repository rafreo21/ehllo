import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

export type RecordingStorageDestination = 'local_only' | 'google_drive' | 'onedrive';

const RECORDING_STORAGE_DESTINATION_KEY = 'aftermeet.recording.storage-destination';

export async function readRecordingStorageDestination(): Promise<RecordingStorageDestination> {
  const stored = await AsyncStorage.getItem(RECORDING_STORAGE_DESTINATION_KEY);
  return stored === 'google_drive' || stored === 'onedrive' ? stored : 'local_only';
}

export async function writeRecordingStorageDestination(destination: RecordingStorageDestination) {
  await AsyncStorage.setItem(RECORDING_STORAGE_DESTINATION_KEY, destination);
}

export function recordingStorageDestinationLabel(destination: RecordingStorageDestination) {
  switch (destination) {
    case 'google_drive': return 'Google Drive';
    case 'onedrive': return 'OneDrive';
    default: return 'only this device';
  }
}
