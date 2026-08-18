import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Internal navigation intentionally uses plain <a> tags instead of next/link:
    // vinext's client-side Link transition throws in the production Vercel build
    // (navigateClientSide resolves to the wrong environment build), so full-page
    // navigation is used everywhere until that upstream bug is fixed.
    rules: {
      "@next/next/no-html-link-for-pages": "off",

      // Every Apple Wallet pass returned 500 with an empty body because a comment
      // was placed between `return` and its value: automatic semicolon insertion
      // made it a bare `return;` and left the response unreachable. It
      // typechecked, because a route may legitimately return undefined, and it
      // linted clean, because this rule was not enabled. It is now, as an error -
      // unreachable code after a return is never intentional.
      "no-unreachable": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
