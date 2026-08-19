import { connect, constants } from "node:http2";

import type { AppleWalletCerts } from "./wallet-config";

/**
 * Sends the silent push that tells a device one of its passes has changed.
 *
 * Authenticates with the *pass type* certificate, not the app's APNs credentials.
 * These are separate things that are easy to conflate: the app's push credentials
 * are missing in this project and iOS app notifications suffer for it, but pass
 * updates are signed by the same certificate that signs the pass itself, which is
 * already present wherever passes are built. Nothing here depends on the app.
 *
 * Always the production APNs host. A pass has no sandbox equivalent - the
 * sandbox/production split is a property of an app's entitlement, not of a pass type -
 * so the staging pass type talks to the same host the production one does.
 */
const APNS_HOST = "https://api.push.apple.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type PassPushResult = {
  pushToken: string;
  status: number | null;
  /** Set when APNs says this token is permanently dead and the row should go. */
  expired: boolean;
};

/**
 * The body is an empty JSON object, which is what Apple specifies for a pass
 * update: there is no alert, no badge and no sound, because the notification is not
 * for the person - it is an instruction to the device to come and refetch.
 *
 * apns-push-type is deliberately not set. Apple documents required values for alert
 * and background pushes to apps and says nothing about passes, and an unrecognised
 * or wrong value is rejected outright - so this sends what the pass documentation
 * asks for and no more.
 */
export async function pushPassUpdate(
  pushTokens: string[],
  certs: AppleWalletCerts,
): Promise<PassPushResult[]> {
  if (!pushTokens.length) return [];

  let client: ReturnType<typeof connect>;
  try {
    client = connect(APNS_HOST, {
      cert: certs.signerCert,
      key: certs.signerKey,
      ...(certs.signerKeyPassphrase ? { passphrase: certs.signerKeyPassphrase } : {}),
    });
  } catch {
    // A malformed certificate should not take down whatever saved the card.
    return pushTokens.map((pushToken) => ({ pushToken, status: null, expired: false }));
  }

  // One connection, every token. APNs is built for exactly this and opening a
  // connection per device would spend more time in TLS than in sending.
  const results = await Promise.all(pushTokens.map((pushToken) => new Promise<PassPushResult>((resolve) => {
    let settled = false;
    const done = (status: number | null) => {
      if (settled) return;
      settled = true;
      // 410 Gone is APNs saying this device will never accept another push for this
      // topic. Anything else - including a 5xx - might succeed next time and must
      // not cost someone their registration.
      resolve({ pushToken, status, expired: status === 410 });
    };

    try {
      const request = client.request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: `/3/device/${encodeURIComponent(pushToken)}`,
        "apns-topic": certs.passTypeId,
        [constants.HTTP2_HEADER_CONTENT_TYPE]: "application/json",
      });
      request.setTimeout(REQUEST_TIMEOUT_MS, () => { request.close(); done(null); });
      request.on("response", (headers) => {
        done(Number(headers[constants.HTTP2_HEADER_STATUS]) || null);
      });
      request.on("error", () => done(null));
      // Drain the body so the stream can close cleanly even when APNs replies with
      // an error document.
      request.on("data", () => {});
      request.end(JSON.stringify({}));
    } catch {
      done(null);
    }
  })));

  client.close();
  return results;
}
