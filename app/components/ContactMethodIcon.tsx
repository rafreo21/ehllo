import type { IconComponent } from "../../lib/icon-component";
import { Calendar as CalendarBlankIcon } from "react-feather";
import { MessageCircle as ChatCircleDotsIcon } from "react-feather";
import { DollarSign as CurrencyDollarIcon } from "react-feather";
import { DiscordLogoIcon } from "@phosphor-icons/react/dist/csr/DiscordLogo";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Facebook as FacebookLogoIcon } from "react-feather";
import { GitHub as GithubLogoIcon } from "react-feather";
import { Globe as GlobeIcon } from "react-feather";
import { Instagram as InstagramLogoIcon } from "react-feather";
import { Link2 as LinkSimpleIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { MapPin as MapPinIcon } from "react-feather";
import { PaypalLogoIcon } from "@phosphor-icons/react/dist/csr/PaypalLogo";
import { Phone as PhoneIcon } from "react-feather";
import { SkypeLogoIcon } from "@phosphor-icons/react/dist/csr/SkypeLogo";
import { SnapchatLogoIcon } from "@phosphor-icons/react/dist/csr/SnapchatLogo";
import { Star as StarIcon } from "react-feather";
import { TelegramLogoIcon } from "@phosphor-icons/react/dist/csr/TelegramLogo";
import { ThreadsLogoIcon } from "@phosphor-icons/react/dist/csr/ThreadsLogo";
import { TiktokLogoIcon } from "@phosphor-icons/react/dist/csr/TiktokLogo";
import { Twitch as TwitchLogoIcon } from "react-feather";
import { WhatsappLogoIcon } from "@phosphor-icons/react/dist/csr/WhatsappLogo";
import { XLogoIcon } from "@phosphor-icons/react/dist/csr/XLogo";
import { Youtube as YoutubeLogoIcon } from "react-feather";
import type { ComponentType } from "react";

// These method types still render a Phosphor logo mark (no faithful react-feather
// equivalent exists), so they alone keep the `weight="bold"` prop below.
const PHOSPHOR_METHOD_TYPES = new Set([
  "x", "threads", "snapchat", "tiktok", "whatsapp", "discord", "skype", "telegram", "paypal",
]);

const METHOD_ICONS: Record<string, IconComponent> = {
  email: EnvelopeSimpleIcon,
  phone: PhoneIcon,
  website: GlobeIcon,
  link: LinkSimpleIcon,
  address: MapPinIcon,
  x: XLogoIcon,
  instagram: InstagramLogoIcon,
  threads: ThreadsLogoIcon,
  linkedin: LinkedinLogoIcon,
  facebook: FacebookLogoIcon,
  youtube: YoutubeLogoIcon,
  snapchat: SnapchatLogoIcon,
  tiktok: TiktokLogoIcon,
  twitch: TwitchLogoIcon,
  yelp: StarIcon,
  whatsapp: WhatsappLogoIcon,
  signal: ChatCircleDotsIcon,
  discord: DiscordLogoIcon,
  skype: SkypeLogoIcon,
  telegram: TelegramLogoIcon,
  github: GithubLogoIcon,
  calendly: CalendarBlankIcon,
  paypal: PaypalLogoIcon,
  venmo: CurrencyDollarIcon,
  cashapp: CurrencyDollarIcon,
};

export function ContactMethodIcon({ type, size = 21, color }: { type: string; size?: number; color?: string }) {
  const Icon = METHOD_ICONS[type] || LinkSimpleIcon;
  return PHOSPHOR_METHOD_TYPES.has(type)
    ? <Icon aria-hidden size={size} weight="bold" color={color} />
    : <Icon aria-hidden size={size} color={color} />;
}
