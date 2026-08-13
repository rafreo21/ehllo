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
  cardUrl: 'https://aftermeet.app/c/demo',
  shareDeepLink: 'aftermeet://share-card',
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
