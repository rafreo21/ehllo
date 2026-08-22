import { NextResponse } from "next/server";

// Android App Links verification (https://developer.android.com/training/app-links/verify-android-applinks).
// Lets a card link opened on a device with the app installed launch straight into
// the app instead of the browser.
//
// Two fingerprints, and both are needed. Play App Signing re-signs the upload with
// its own certificate, so an app installed from Play presents a different SHA-256
// than the one EAS signed. Only the upload key was listed here, which meant
// verification failed for every Play install: Android fell back to asking "open with
// app or browser" instead of going straight in, and a card QR scanned on a Play build
// landed in a browser. Verified links never prompt - being asked is the symptom.
//
// Confirmed by pulling the installed APK off a Play-installed device and reading its
// certificate with apksigner, rather than by trusting either key's paperwork.
const PLAY_SIGNING_FINGERPRINT = "4B:57:B2:6E:2F:43:20:D8:39:36:C4:24:39:AE:A8:ED:BF:B2:9A:7F:0F:CC:48:22:0B:BF:5D:DF:BD:E9:18:16";
const UPLOAD_FINGERPRINT = "CD:F4:0E:8F:51:99:A2:7D:FA:C3:85:BC:D8:6A:2D:3F:F8:2B:81:1C:9B:F1:AC:2E:3C:6F:65:B5:3A:B0:7C:41";

export async function GET(request: Request) {
  const hostname = new URL(request.url).hostname;
  const isStaging = hostname.startsWith("staging.");

  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: isStaging ? "com.ehllo.app.staging" : "com.ehllo.app",
        // Both, so a build installed from Play and one installed directly from EAS
        // or adb each verify. Production stays empty until a production build has
        // been signed and its Play certificate can be read the same way.
        sha256_cert_fingerprints: isStaging
          ? [PLAY_SIGNING_FINGERPRINT, UPLOAD_FINGERPRINT]
          : [],
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: { "Content-Type": "application/json" },
  });
}
