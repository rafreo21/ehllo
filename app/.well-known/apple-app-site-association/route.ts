import { NextResponse } from "next/server";

// iOS Universal Links verification (https://developer.apple.com/documentation/xcode/supporting-associated-domains).
// Lets a card link opened on a device with the app installed launch straight
// into the app instead of Safari. Must be served with no file extension at
// exactly this path, over HTTPS, with a JSON content type (no redirects).
// Team ID is the Apple Developer Team ID (not the bundle identifier).
const APPLE_TEAM_ID = "VDR84B8UU2";

export async function GET(request: Request) {
  const hostname = new URL(request.url).hostname;
  const isStaging = hostname.startsWith("staging.");
  const bundleId = isStaging ? "com.ehllo.app.staging" : "com.ehllo.app";

  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${APPLE_TEAM_ID}.${bundleId}`,
          appIDs: [`${APPLE_TEAM_ID}.${bundleId}`],
          paths: ["/c/*"],
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: { "Content-Type": "application/json" },
  });
}
