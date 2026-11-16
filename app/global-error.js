"use client";

import { captureException } from "../lib/browser-sentry.mjs";
import NextError from "next/error";
import { useEffect } from "react";
import { isSentryEnabled } from "../sentry.runtime.config";

export default function GlobalError({ error }) {
  useEffect(() => {
    console.error(error);

    if (isSentryEnabled("browser")) {
      void captureException(error);
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
