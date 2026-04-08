"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";
import { isSentryEnabled } from "../sentry.runtime.config";

export default function GlobalError({ error }) {
  useEffect(() => {
    console.error(error);

    if (isSentryEnabled("browser")) {
      Sentry.captureException(error);
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
