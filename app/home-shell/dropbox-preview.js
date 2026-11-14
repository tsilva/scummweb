"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function DropboxPreviewContent({ children }) {
  const searchParams = useSearchParams();
  return searchParams.get("dropbox") === "true" ? children : null;
}

export default function DropboxPreview({ children }) {
  return <Suspense fallback={null}><DropboxPreviewContent>{children}</DropboxPreviewContent></Suspense>;
}
