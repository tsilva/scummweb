"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { dropboxPreviewEnabled } from "../dropbox/feature.mjs";

function DropboxPreviewContent({ children }) {
  const searchParams = useSearchParams();
  return dropboxPreviewEnabled(searchParams) ? children : null;
}

export default function DropboxPreview({ children }) {
  return <Suspense fallback={null}><DropboxPreviewContent>{children}</DropboxPreviewContent></Suspense>;
}
