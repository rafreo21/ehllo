type BrandMarkProps = {
  className?: string;
  size?: number;
};

export function BrandMark({ className, size = 36 }: BrandMarkProps) {
  return (
    // Plain img keeps the SVG reliable across vinext/Vercel without image optimizer quirks.
    <img
      className={className}
      src="/ehllo-logo.svg?v=2"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
