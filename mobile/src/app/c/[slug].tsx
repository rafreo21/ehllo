import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * The path a card QR code actually points at.
 *
 * Both platforms already claim it - iOS through applinks:staging.ehllo.io and
 * Android through the intentFilter with pathPrefix "/c/", autoVerify on - so the OS
 * hands ehllo.io/c/<slug> straight to the app instead of Safari or Chrome. Nothing
 * in the router answered to it, which is why scanning a wallet pass and choosing to
 * open in the app produced "Unmatched Route" on the very link the app had asked to
 * be given.
 *
 * Forwards to the scan route rather than duplicating it: /connections/scan/[slug]
 * already resolves the slug, records the connection and lands on that person, and
 * two routes doing the same thing differently is how they drift apart.
 *
 * The slug is passed through untouched, exactly as the camera scanner does.
 * parseEhlloCardFromUrl does not expand the shortened form back either - a card QR
 * carries "/c/raphael" with the "card-" prefix dropped to keep the code at 29x29 -
 * and the server resolves both spellings.
 */
export default function CardDeepLinkScreen() {
  const { slug, s } = useLocalSearchParams<{ slug: string; s?: string }>();
  const normalized = typeof slug === 'string' ? slug.trim().toLowerCase() : '';

  // A bare /c/ with nothing after it is not worth an error screen; the people list is
  // where someone opening a card link was heading anyway.
  if (!normalized) return <Redirect href="/connections" />;

  // NFC tags carry ?s=nfc; nothing else does, because every other surface is a QR whose
  // size was deliberately minimised and five more characters would cost scannability.
  // Anything unmarked is simply a link, which is honest about what we know.
  const source = typeof s === 'string' && s.trim().toLowerCase() === 'nfc' ? 'nfc' : 'link';

  return (
    <Redirect
      href={`/connections/scan/${encodeURIComponent(normalized)}?source=${source}`}
    />
  );
}
