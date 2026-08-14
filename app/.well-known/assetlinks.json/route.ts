import { NextResponse } from "next/server";

// Android App Links verification (https://developer.android.com/training/app-links/verify-android-applinks).
// Lets a card link opened on a device with the app installed launch straight
// into the app instead of the browser. The SHA-256 fingerprint below is the
// staging app's actual signing certificate (extracted from an installed
// build) — the production package has no fingerprint here yet because no
// production build has been signed/installed to pull it from. Add the Play
// Console "App signing key certificate" SHA-256 once production ships.
const STAGING_FINGERPRINT = "CD:F4:0E:8F:51:99:A2:7D:FA:C3:85:BC:D8:6A:2D:3F:F8:2B:81:1C:9B:F1:AC:2E:3C:6F:65:B5:3A:B0:7C:41";

export async function GET(request: Request) {
  const hostname = new URL(request.url).hostname;
  const isStaging = hostname.startsWith("staging.");

  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: isStaging ? "com.ehllo.app.staging" : "com.ehllo.app",
        sha256_cert_fingerprints: isStaging
          ? [STAGING_FINGERPRINT]
          : [],
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: { "Content-Type": "application/json" },
  });
}
