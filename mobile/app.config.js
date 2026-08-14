// Dynamic config so a "staging" build can be installed side-by-side with
// production on the same device (own bundle ID/package, own app name, own
// backend) instead of overwriting it. Selected via APP_VARIANT — set by the
// mobile/scripts/*.sh helpers. Plain local commands default to staging so a
// developer cannot accidentally write to production.
const requestedVariant = process.env.APP_VARIANT ?? "staging";
if (!['staging', 'production'].includes(requestedVariant)) {
  throw new Error(`Invalid APP_VARIANT: ${requestedVariant}. Use staging or production.`);
}
const APP_VARIANT = requestedVariant;
const IS_STAGING = APP_VARIANT === "staging";

// `ehllo` is the public application identity. The EAS slugs/project IDs below
// intentionally stay on their existing projects so build credentials and OTA
// history are not orphaned during the brand migration.
const BASE_BUNDLE_ID = "com.ehllo.app";
const bundleId = IS_STAGING ? `${BASE_BUNDLE_ID}.staging` : BASE_BUNDLE_ID;
const EAS_PROJECT = IS_STAGING
  ? {
      slug: "aftermeet-staging",
      projectId: "7f8c9f69-0c82-4b58-87db-a0e7cdc89c0a",
    }
  : {
      slug: "aftermeet",
      projectId: "97c0cff3-8e13-4e80-b62f-733ad1cbf663",
    };

const BACKEND = IS_STAGING
  ? {
      supabaseUrl: "https://vgrxsdjfrkmpmpqvuqty.supabase.co",
      supabaseAnonKey: "sb_publishable_eSjPw8e5uHqCDUtAf_vdDQ_SXAS-hsW",
      publicCardBaseUrl: "https://staging.ehllo.io",
    }
  : {
      supabaseUrl: "https://tgpzxgrvdmmwnodxrooh.supabase.co",
      supabaseAnonKey: "sb_publishable_pKxGkQpYza-qmBXOMrP7qQ_D4BfJ3Uj",
      publicCardBaseUrl: "https://ehllo.io",
    };

module.exports = {
  expo: {
    name: IS_STAGING ? "ehllo Staging" : "ehllo",
    owner: "rafreo",
    slug: EAS_PROJECT.slug,
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    // Keep the AfterMeet schemes as inbound aliases for links already shared
    // by staging builds. New links are always emitted with the ehllo scheme.
    scheme: IS_STAGING
      ? ["ehllo-staging", "aftermeet-staging"]
      : ["ehllo", "aftermeet"],
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/images/icon.png",
      bundleIdentifier: bundleId,
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: [
          "linkedin",
          "twitter",
          "instagram",
          "whatsapp",
          "tg",
          "fb",
          "barcelona",
          "snapchat",
          "paypal",
          "venmo",
          "cashapp",
          "comgooglecalendar",
          "googlecalendar",
          "ms-outlook",
          "googlegmail",
        ],
      },
    },
    android: {
      package: bundleId,
      adaptiveIcon: {
        backgroundColor: "#87EA5C",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: IS_STAGING ? "staging.ehllo.io" : "ehllo.io",
              pathPrefix: "/c/",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    androidStatusBar: {
      backgroundColor: "#F5F7F3",
      barStyle: "dark-content",
      translucent: false,
    },
    androidNavigationBar: {
      backgroundColor: "#F5F7F3",
      barStyle: "dark-content",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-dev-client",
      "expo-asset",
      "expo-image",
      "expo-sharing",
      [
        "@sentry/react-native/expo",
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT_MOBILE,
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/android-icon-monochrome.png",
          color: "#9FE870",
          defaultChannel: "follow-ups",
        },
      ],
      [
        "expo-navigation-bar",
        {
          style: "dark",
          enforceContrast: true,
        },
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#163300",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      "expo-secure-store",
      [
        "expo-camera",
        {
          cameraPermission: "Allow ehllo to scan contact card QR codes.",
        },
      ],
      [
        "expo-contacts",
        {
          contactsPermission: "Allow ehllo to save people you meet to your contacts.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow ehllo to use photos on your contact card.",
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission: "Allow ehllo to record meetings you choose to capture.",
          enableBackgroundRecording: true,
        },
      ],
      [
        "expo-speech-recognition",
        {
          microphonePermission: "Allow ehllo to record meetings you choose to capture.",
          speechRecognitionPermission: "Allow ehllo to transcribe your meetings while you record.",
          androidSpeechServicePackages: [
            "com.google.android.googlequicksearchbox",
            "com.google.android.tts",
            "com.google.android.as",
          ],
        },
      ],
      [
        "expo-widgets",
        {
          bundleIdentifier: `${bundleId}.widgets`,
          groupIdentifier: `group.${bundleId}`,
          widgets: [
            {
              name: "QrScanWidget",
              displayName: "ehllo QR Scan",
              description: "Large scannable QR code for your card.",
              supportedFamilies: ["systemSmall"],
            },
            {
              name: "BusinessCardWidget",
              displayName: "ehllo Business Card",
              description: "QR code plus your name, role, and company.",
              supportedFamilies: ["systemMedium"],
            },
            {
              name: "RecentConnectionsWidget",
              displayName: "ehllo Recent Connections",
              description: "Recent people who shared their details with you.",
              supportedFamilies: ["systemMedium"],
            },
          ],
        },
      ],
      "./plugins/withAndroidQuickShareWidget",
      "./plugins/withAndroidSystemBars",
      [
        "react-native-nfc-manager",
        {
          nfcPermission: "Allow ehllo to program NFC tags and share your card when someone taps your phone.",
        },
      ],
      "./plugins/withAndroidNfcHce",
      "@react-native-community/datetimepicker",
    ],
    experiments: {
      typedRoutes: true,
    },
    ...(IS_STAGING
      ? {
          updates: {
            url: `https://u.expo.dev/${EAS_PROJECT.projectId}`,
          },
          runtimeVersion: {
            policy: "appVersion",
          },
        }
      : {}),
    extra: {
      eas: {
        projectId: EAS_PROJECT.projectId,
      },
      publicCardBaseUrl: BACKEND.publicCardBaseUrl,
      supabaseUrl: BACKEND.supabaseUrl,
      supabaseAnonKey: BACKEND.supabaseAnonKey,
      // Not yet provisioned — the address-autocomplete field falls back to a
      // plain text input until this is set. Same key for both variants
      // (Places is billing-account-scoped, not staging/production-split).
      googlePlacesApiKey: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "",
      buildNumber: 5,
      buildStamp: IS_STAGING ? "2026-08-14-ehllo-staging" : "2026-08-14-ehllo",
      appVariant: APP_VARIANT,
    },
  },
};
