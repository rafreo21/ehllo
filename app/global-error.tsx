"use client";

import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      }).catch(() => {});
    }
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
