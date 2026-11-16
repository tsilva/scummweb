"use client";

import { lazy } from "react";
import { afterHeroPaint } from "./library-hydration.mjs";

// Turbopack removes the server-only branch from the browser graph. Render the
// complete library synchronously on the server, including without JavaScript.
const Library = import.meta.env.SSR
  ? require("./source-library").default
  : lazy(() => afterHeroPaint().then(() => import("./source-library")));

export default function DeferredSourceLibrary(props) {
  return <Library {...props} />;
}
