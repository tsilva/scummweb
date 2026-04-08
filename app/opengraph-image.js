import { ImageResponse } from "next/og";
import { getPresentedGameByTarget } from "./game-page-data";
import {
  HOME_DESCRIPTION,
  HOME_FEATURED_GAME_TARGET,
  HOME_HERO_KICKER,
  HOME_HERO_TITLE,
  SITE_NAME,
  buildAbsoluteUrl,
} from "./seo";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";
export const dynamic = "force-dynamic";

function getOpenGraphBackgroundPath(pathname) {
  if (!pathname) {
    return "";
  }

  return pathname.replace(/\.webp(?=(?:\?|$))/, ".jpg");
}

export default function OpenGraphImage() {
  const featuredGame = getPresentedGameByTarget(HOME_FEATURED_GAME_TARGET);
  const backgroundImage =
    featuredGame?.spotlightImage || featuredGame?.heroImage || featuredGame?.posterImage || "";
  const backgroundUrl = backgroundImage
    ? buildAbsoluteUrl(getOpenGraphBackgroundPath(backgroundImage))
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#08110d",
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
              opacity: 0.38,
            }}
            width="1200"
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(4, 8, 7, 0.97) 0%, rgba(4, 8, 7, 0.92) 54%, rgba(4, 8, 7, 0.6) 100%)",
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
            <span style={{ color: "#9dd7a4" }}>{SITE_NAME}</span>
            <span style={{ opacity: 0.8 }}>{HOME_HERO_KICKER}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              width: "74%",
            }}
          >
            <div
              style={{
                fontSize: "68px",
                lineHeight: 1.02,
                fontWeight: 800,
              }}
            >
              {HOME_HERO_TITLE}
            </div>
            <div
              style={{
                fontSize: "29px",
                lineHeight: 1.35,
                color: "#e3e7da",
              }}
            >
              {HOME_DESCRIPTION}
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
            <span>{featuredGame?.displayTitle || "Beneath a Steel Sky"}</span>
            <span>{featuredGame?.badge || "Freeware classic"}</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
