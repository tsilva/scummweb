import { ImageResponse } from "next/server";
import { getPresentedGameBySlug } from "../game-page-data";
import { getSiteUrl } from "../site-config";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

function getAbsoluteAssetUrl(pathname) {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
}

export default async function OpenGraphImage({ params }) {
  const game = await getPresentedGameBySlug(params.gameSlug);
  const backgroundImage = game?.spotlightImage || game?.posterImage || game?.heroImage || "";
  const backgroundUrl = backgroundImage ? getAbsoluteAssetUrl(backgroundImage) : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#060f0c",
          color: "#f5f3e8",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {backgroundUrl ? (
          <img
            alt=""
            height="630"
            src={backgroundUrl}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.4,
            }}
            width="1200"
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(4, 8, 7, 0.96) 0%, rgba(4, 8, 7, 0.9) 46%, rgba(4, 8, 7, 0.58) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            width: "100%",
            padding: "54px 62px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: "#9dd7a4" }}>scummweb</span>
            <span style={{ opacity: 0.78 }}>Play instantly in your browser</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "22px",
              width: "72%",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "14px",
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: "26px",
                color: "#b7c9b6",
              }}
            >
              <span>{game?.eyebrow || "Featured Classic"}</span>
              <span>{game?.year || "Archive"}</span>
              <span>{game?.badge || "Playable Now"}</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              <div
                style={{
                  fontSize: "68px",
                  lineHeight: 1.02,
                  fontWeight: 800,
                }}
              >
                {game?.displayTitle || "scummweb"}
              </div>
              <div
                style={{
                  fontSize: "29px",
                  lineHeight: 1.35,
                  color: "#e3e7da",
                }}
              >
                {game?.summary ||
                  "Shareable browser landing pages for classic ScummVM adventures."}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "24px",
              color: "#c8d8c7",
            }}
          >
            <span>{game?.genre || "ScummVM Adventure"}</span>
            <span>{game?.studio || "ScummVM Runtime"}</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
