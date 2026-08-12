type ProviderIconProps = {
  size?: number;
};

/** Official provider artwork shared by auth and Connected Accounts. */
export function GoogleProviderIcon({ size = 21 }: ProviderIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 262" fill="none" aria-hidden="true">
      <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l41.196 31.913c24.659-22.774 38.875-56.282 38.875-96.027Z" fill="#4285F4" />
      <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-42.356 32.782C35.393 231.798 79.49 261.1 130.55 261.1Z" fill="#34A853" />
      <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82L13.925 71.947C5.077 89.644 0 109.517 0 130.55c0 21.033 5.077 40.905 13.925 58.602l42.356-32.782Z" fill="#FBBC05" />
      <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251Z" fill="#EB4335" />
    </svg>
  );
}

export function MicrosoftProviderIcon({ size = 21 }: ProviderIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" aria-hidden="true">
      <rect width="121.666" height="121.666" fill="#F1511B" />
      <rect x="134.335" width="121.665" height="121.666" fill="#80CC28" />
      <rect y="134.336" width="121.663" height="121.666" fill="#00ADEF" />
      <rect x="134.335" y="134.336" width="121.665" height="121.666" fill="#FBBC09" />
    </svg>
  );
}

export function LinkedInProviderIcon({ size = 21 }: ProviderIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" aria-hidden="true">
      <path d="M218.123 218.127h-37.931v-59.403c0-14.165-.253-32.4-19.728-32.4-19.756 0-22.779 15.433-22.779 31.369v60.43H99.754V95.967h36.414v16.694h.51c7.425-12.696 21.231-20.278 35.928-19.733 38.445 0 45.533 25.288 45.533 58.186l-.016 67.013ZM56.955 79.269a22.015 22.015 0 1 1-.008-44.025 22.015 22.015 0 0 1 .008 44.025Zm18.966 138.858H37.95V95.967h37.971v122.16ZM237.033.018H18.89C8.58-.098.125 8.16 0 18.471v219.053c.121 10.315 8.575 18.582 18.889 18.474h218.144c10.336.128 18.823-8.138 18.966-18.473V18.455C255.852 8.124 247.364-.134 237.033.001v.017Z" fill="#0A66C2" />
    </svg>
  );
}
