export const colors = {
  ink: '#163300',
  inkSoft: '#29451F',
  accent: '#9FE870',
  accentPressed: '#86D659',
  canvas: '#F5F7F3',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2EC',
  line: '#D9E0D6',
  muted: '#667363',
  danger: '#B42318',
  warning: '#8A4B08',
  link: '#2F5711',
  white: '#FFFFFF',
};

export const radius = { small: 8, medium: 12, large: 18, round: 999 };
export const spacing = { x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x8: 32 };

/**
 * Airbnb Cereal ships as six separate families rather than one family with
 * weight variants — each .otf declares its own name (AirbnbCereal_W_Bd,
 * _Bk, _Md …). React Native can only pick a face by family name, so
 * fontWeight cannot select between them and every text style has to name the
 * family it wants. These keys mirror the weights the app already uses.
 */
export const fonts = {
  light: 'AirbnbCereal_W_Lt',
  regular: 'AirbnbCereal_W_Bk',
  medium: 'AirbnbCereal_W_Md',
  semibold: 'AirbnbCereal_W_Md',
  bold: 'AirbnbCereal_W_Bd',
  extrabold: 'AirbnbCereal_W_XBd',
  black: 'AirbnbCereal_W_Blk',
} as const;

/**
 * Maps the numeric weights already scattered through the styles onto the
 * matching family, so a style keeps its existing `fontWeight` (which still
 * drives the system fallback before the fonts finish loading) and gains the
 * family that actually renders it.
 */
export const fontForWeight = {
  '400': fonts.regular,
  '500': fonts.medium,
  '600': fonts.semibold,
  '700': fonts.bold,
  '800': fonts.extrabold,
  '900': fonts.black,
} as const;
