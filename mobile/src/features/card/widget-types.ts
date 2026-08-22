export type WidgetConnection = {
  name: string;
  subtitle: string;
  phone?: string;
  email?: string;
  /** Opens this person's profile rather than the connections list. */
  profileDeepLink?: string;
  /** A prefilled follow-up email, so the widget's envelope drafts a message rather than
   *  dumping the person into an empty compose window. */
  followUpMailUrl?: string;
  /** Initials, for the green fallback avatar when there is no photo. */
  initials: string;
  /** Cached local file, for the iOS widget. */
  photoImageUri?: string;
  /** The same photo as base64, because the Android bridge carries strings, not file URIs. */
  photoImageBase64?: string;
};

export type WidgetCardPayload = {
  name: string;
  role: string;
  company: string;
  cardUrl: string;
  shareDeepLink: string;
  qrImageBase64?: string;
  photoImageBase64?: string;
  qrImageUri?: string;
  photoImageUri?: string;
  initials: string;
  themeColor: string;
  themeTextColor: string;
  themeMutedColor: string;
  themeSoftColor: string;
};



export type WidgetSnapshot = {
  cards: WidgetCardPayload[];
  connectionsDeepLink: string;
  connections: WidgetConnection[];
  logoImageUri?: string;
  logoImageBase64?: string;
  qrImageUri?: string;
  /**
   * Whether anyone is actually signed in on this device.
   *
   * Without it, a signed-out widget fell back to the demo card - so it sat on the home screen
   * showing Alex Morgan's details as though they were yours, and its QR led to a demo page.
   * Apple's guidance is explicit that a widget needing an account should say so, giving
   * "Sign in to view reservations" as the example. The gallery preview is a different case and
   * still wants realistic sample content, which is why this is a flag rather than an absence:
   * no snapshot at all means the gallery, a snapshot saying false means signed out.
   */
  signedIn: boolean;
};

export const WIDGET_OPTIONS = [
  {
    id: 'qr-scan',
    title: 'QR Scan',
    size: '2 × 2',
    description: 'Large scannable QR code for quick sharing.',
  },
  {
    id: 'business-card',
    title: 'Business Card',
    size: '4 × 2',
    description: 'QR code plus your name, role, and company.',
  },
  {
    id: 'recent-connections',
    title: 'Recent Connections',
    size: '4 × 2',
    description: 'People who recently shared their details with you.',
  },
] as const;

export type WidgetOptionId = (typeof WIDGET_OPTIONS)[number]['id'];

// There are deliberately NO demo card or demo connection constants here any more.
//
// They existed so a widget with no data had something to draw, and that is exactly how a real
// person's home screen ended up showing "Alex Morgan - Product Designer - ehllo" as though it
// were theirs, with a QR pointing at a demo page. Every widget now renders an explicit
// placeholder ("Your name", "Your connections") when there is nothing real to show, which is
// honest and needs no sample identity. If you find yourself wanting a demo record, you want a
// placeholder state instead.
