"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readRemoteGameArchive } from "../../../game-bucket.mjs";
import { readGameSources } from "../../../game-sources.mjs";
import { selectGameArchive } from "../../../local-game-archive.mjs";

export default function BucketPlayFrame({ game, officialUrl, catalog }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    readGameSources(catalog, officialUrl).then((sources) => {
      if (!active) return;
      const source = sources.find((source) => source.url && source.target === game.target);
      if (source) {
        // Old bucket bookmarks used the default save folder. Keep it for this launch.
        selectGameArchive((signal, onProgress) => readRemoteGameArchive(source.url, { signal, onProgress }),
          { ...game, skipIntro: null });
      }
      router.replace(`${game.playHref}${window.location.hash}`);
    }).catch(() => { if (active) setError("Could not load saved games from this browser."); });
    return () => { active = false; };
  }, [game, catalog, officialUrl, router]);
  return <p className="page-shell" role="status">{error || `Opening ${game.displayTitle}…`}
    {error && <> <a href={game.href}>Return to game</a></>}
  </p>;
}
