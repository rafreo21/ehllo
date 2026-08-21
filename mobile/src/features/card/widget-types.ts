export type WidgetConnection = {
  name: string;
  subtitle: string;
  phone?: string;
  email?: string;
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
};

export const WIDGET_DEMO_CARD: WidgetCardPayload = {
  name: 'Alex Morgan',
  role: 'Product Designer',
  company: 'ehllo',
  cardUrl: 'https://ehllo.io/c/demo',
  shareDeepLink: 'ehllo://share-card',
  initials: 'AM',
};

export const WIDGET_DEMO_CONNECTIONS: WidgetConnection[] = [
  { name: 'Jordan Lee', subtitle: 'Shared via your card' },
  { name: 'Cameron Williamson', subtitle: 'Shared via your card' },
];

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
