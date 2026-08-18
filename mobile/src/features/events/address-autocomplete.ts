import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AddressSuggestion = {
  placeId: string;
  description: string;
};

// Google's Android/iOS app-restricted keys are verified via these headers,
// not via anything the OS attaches automatically - a plain fetch() (as
// opposed to a request made through a native Google SDK) never sends them
// on its own, so an app-restricted key fails every request with a generic
// "not authorized" error unless the app sets them itself. iOS only needs
// the bundle ID; Android also needs the signing cert's SHA-1 fingerprint
// (colon-free hex), which differs between this local debug dev-client and
// a real EAS/Play Store release build.
const ANDROID_DEBUG_CERT_SHA1 = '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625';
const ANDROID_RELEASE_CERT_SHA1 = '22A1C83EEFE83F90609298F3B5CEEDFC979ED1FB';

function buildPlatformHeaders(): Record<string, string> {
  if (Platform.OS === 'android') {
    const packageName = Constants.expoConfig?.android?.package;
    if (!packageName) return {};
    return {
      'X-Android-Package': packageName,
      'X-Android-Cert': __DEV__ ? ANDROID_DEBUG_CERT_SHA1 : ANDROID_RELEASE_CERT_SHA1,
    };
  }
  if (Platform.OS === 'ios') {
    const bundleId = Constants.expoConfig?.ios?.bundleIdentifier;
    if (!bundleId) return {};
    return { 'X-Ios-Bundle-Identifier': bundleId };
  }
  return {};
}

/**
 * Google Places Autocomplete (legacy REST endpoint - simplest to call
 * directly from the client with a restricted API key, no SDK needed).
 * Deliberately unrestricted by `types` so both named venues ("ExCeL
 * London") and plain addresses/postcodes surface, matching how a user
 * would actually search for an event location.
 */
export async function fetchAddressSuggestions(apiKey: string, input: string): Promise<AddressSuggestion[]> {
  const trimmed = input.trim();
  if (!apiKey || trimmed.length < 3) return [];

  const params = new URLSearchParams({ input: trimmed, key: apiKey });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, {
    headers: buildPlatformHeaders(),
  });
  if (!response.ok) return [];

  const payload = await response.json() as {
    status?: string;
    predictions?: { place_id?: string; description?: string }[];
  };
  if (payload.status !== 'OK') return [];

  return (payload.predictions ?? []).flatMap((item) => (
    item.place_id && item.description ? [{ placeId: item.place_id, description: item.description }] : []
  ));
}
