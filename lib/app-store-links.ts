export type MobilePlatform = "ios" | "android" | "unknown";

export function detectMobilePlatform(userAgent?: string): MobilePlatform {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "unknown";
}

export function getPlayStoreUrl() {
  return process.env.NEXT_PUBLIC_ANDROID_APP_URL?.trim() || null;
}

export function getAppStoreUrl() {
  return process.env.NEXT_PUBLIC_IOS_APP_URL?.trim() || null;
}

export function hasPublishedMobileApp() {
  return Boolean(getPlayStoreUrl() || getAppStoreUrl());
}

export function getBetaSignupUrl() {
  return process.env.NEXT_PUBLIC_BETA_SIGNUP_URL?.trim() || null;
}
