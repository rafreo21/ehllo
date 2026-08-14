export type ContactMethodType =
  | 'email' | 'phone' | 'website' | 'link' | 'address'
  | 'x' | 'instagram' | 'threads' | 'linkedin' | 'facebook' | 'youtube' | 'snapchat' | 'tiktok' | 'twitch' | 'yelp'
  | 'whatsapp' | 'signal' | 'discord' | 'skype' | 'telegram'
  | 'github' | 'calendly' | 'paypal' | 'venmo' | 'cashapp';

export type ContactMethod = {
  id: string;
  type: ContactMethodType;
  value: string;
  label: string;
};

export type MobileCard = {
  id?: string;
  slug: string;
  label: string;
  name: string;
  role: string;
  company: string;
  bio: string;
  theme: string;
  photo: string;
  companyLogo: string;
  coverPhoto: string;
  showCompanyDetails: boolean;
  status: 'draft' | 'published';
  methods: ContactMethod[];
  serverUpdatedAt?: string;
  isPrimary?: boolean;
};
