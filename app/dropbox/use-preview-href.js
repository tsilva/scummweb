"use client";

import { useSyncExternalStore } from "react";
import { withDropboxPreview } from "./feature.mjs";

function subscribe(notify) {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
}

const currentHref = () => window.location.href;
const serverHref = () => null;

export function useDropboxPreviewHref(href) {
  return withDropboxPreview(href, useSyncExternalStore(subscribe, currentHref, serverHref));
}
