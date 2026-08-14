export type Country = {
  iso: string;
  name: string;
  dialCode: string;
  flag: string;
};

const RAW: [iso: string, name: string, dialCode: string][] = [
  ["AF", "Afghanistan", "93"],
  ["AL", "Albania", "355"],
  ["DZ", "Algeria", "213"],
  ["AR", "Argentina", "54"],
  ["AU", "Australia", "61"],
  ["AT", "Austria", "43"],
  ["BH", "Bahrain", "973"],
  ["BD", "Bangladesh", "880"],
  ["BE", "Belgium", "32"],
  ["BR", "Brazil", "55"],
  ["BG", "Bulgaria", "359"],
  ["CA", "Canada", "1"],
  ["CL", "Chile", "56"],
  ["CN", "China", "86"],
  ["CO", "Colombia", "57"],
  ["HR", "Croatia", "385"],
  ["CY", "Cyprus", "357"],
  ["CZ", "Czech Republic", "420"],
  ["DK", "Denmark", "45"],
  ["EG", "Egypt", "20"],
  ["EE", "Estonia", "372"],
  ["ET", "Ethiopia", "251"],
  ["FI", "Finland", "358"],
  ["FR", "France", "33"],
  ["DE", "Germany", "49"],
  ["GH", "Ghana", "233"],
  ["GR", "Greece", "30"],
  ["HK", "Hong Kong", "852"],
  ["HU", "Hungary", "36"],
  ["IN", "India", "91"],
  ["ID", "Indonesia", "62"],
  ["IE", "Ireland", "353"],
  ["IL", "Israel", "972"],
  ["IT", "Italy", "39"],
  ["JP", "Japan", "81"],
  ["JO", "Jordan", "962"],
  ["KE", "Kenya", "254"],
  ["KW", "Kuwait", "965"],
  ["LV", "Latvia", "371"],
  ["LB", "Lebanon", "961"],
  ["LT", "Lithuania", "370"],
  ["LU", "Luxembourg", "352"],
  ["MY", "Malaysia", "60"],
  ["MX", "Mexico", "52"],
  ["MA", "Morocco", "212"],
  ["NL", "Netherlands", "31"],
  ["NZ", "New Zealand", "64"],
  ["NG", "Nigeria", "234"],
  ["NO", "Norway", "47"],
  ["OM", "Oman", "968"],
  ["PK", "Pakistan", "92"],
  ["PH", "Philippines", "63"],
  ["PL", "Poland", "48"],
  ["PT", "Portugal", "351"],
  ["QA", "Qatar", "974"],
  ["RO", "Romania", "40"],
  ["RU", "Russia", "7"],
  ["SA", "Saudi Arabia", "966"],
  ["RS", "Serbia", "381"],
  ["SG", "Singapore", "65"],
  ["SK", "Slovakia", "421"],
  ["SI", "Slovenia", "386"],
  ["ZA", "South Africa", "27"],
  ["KR", "South Korea", "82"],
  ["ES", "Spain", "34"],
  ["LK", "Sri Lanka", "94"],
  ["SE", "Sweden", "46"],
  ["CH", "Switzerland", "41"],
  ["TW", "Taiwan", "886"],
  ["TZ", "Tanzania", "255"],
  ["TH", "Thailand", "66"],
  ["TR", "Turkey", "90"],
  ["UG", "Uganda", "256"],
  ["UA", "Ukraine", "380"],
  ["AE", "United Arab Emirates", "971"],
  ["GB", "United Kingdom", "44"],
  ["US", "United States", "1"],
  ["VN", "Vietnam", "84"],
  ["ZW", "Zimbabwe", "263"],
];

export function countryFlag(iso: string) {
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export const COUNTRIES: Country[] = RAW
  .map(([iso, name, dialCode]) => ({
    iso,
    name,
    dialCode,
    flag: countryFlag(iso),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

export const COUNTRIES_BY_ISO = new Map(COUNTRIES.map((country) => [country.iso, country]));

export const DIAL_CODE_LOOKUP = [...COUNTRIES].sort(
  (left, right) => right.dialCode.length - left.dialCode.length,
);

export const DEFAULT_COUNTRY_ISO = "US";

export function countryByIso(iso: string | undefined | null) {
  if (!iso) return COUNTRIES_BY_ISO.get(DEFAULT_COUNTRY_ISO)!;
  return COUNTRIES_BY_ISO.get(iso.toUpperCase()) ?? COUNTRIES_BY_ISO.get(DEFAULT_COUNTRY_ISO)!;
}

export function detectDefaultCountryIso() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    const region = locale.split("-")[1]?.toUpperCase();
    if (region && COUNTRIES_BY_ISO.has(region)) return region;
  } catch {
    // Ignore locale detection failures.
  }

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const timeZoneCountry = TIMEZONE_COUNTRY[timeZone];
    if (timeZoneCountry && COUNTRIES_BY_ISO.has(timeZoneCountry)) return timeZoneCountry;
  } catch {
    // Ignore timezone detection failures.
  }

  return DEFAULT_COUNTRY_ISO;
}

const TIMEZONE_COUNTRY: Record<string, string> = {
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Amsterdam": "NL",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Vienna": "AT",
  "Europe/Zurich": "CH",
  "Europe/Brussels": "BE",
  "Europe/Lisbon": "PT",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Africa/Cairo": "EG",
  "Asia/Dubai": "AE",
  "Asia/Singapore": "SG",
  "Asia/Kolkata": "IN",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Australia/Sydney": "AU",
  "Pacific/Auckland": "NZ",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "America/Sao_Paulo": "BR",
  "America/Mexico_City": "MX",
};
