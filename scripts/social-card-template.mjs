import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";
import sharp from "sharp";

export const size = { width: 1200, height: 630 };

export async function renderSocialCard(card, artwork) {
  // Embed local artwork: builds never fetch the deployed site or another service.
  const background = artwork
    ? `data:image/png;base64,${(await sharp(artwork).rotate().resize(1200, 630, { fit: "cover" }).png().toBuffer()).toString("base64")}`
    : "";
  const response = new ImageResponse(
    h("div", { style: {
      display: "flex", position: "relative", width: "100%", height: "100%",
      overflow: "hidden", background: "#060f0c", color: "#f5f3e8", fontFamily: "Arial, sans-serif",
    } },
    background ? h("img", { alt: "", width: 1200, height: 630, src: background, style: {
      position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4,
    } }) : null,
    h("div", { style: { position: "absolute", inset: 0,
      background: "linear-gradient(90deg, rgba(4, 8, 7, 0.96) 0%, rgba(4, 8, 7, 0.9) 46%, rgba(4, 8, 7, 0.58) 100%)",
    } }),
    h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "space-between",
      position: "relative", width: "100%", padding: "54px 62px",
    } },
    h("div", { style: { display: "flex", alignItems: "center", gap: "16px", fontSize: "28px",
      fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
    } }, h("span", { style: { color: "#9dd7a4" } }, "ScummWEB"),
    h("span", { style: { opacity: 0.78 } }, "Play in your browser")),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "22px", width: "72%" } },
    h("div", { style: { display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap",
      fontSize: "26px", color: "#b7c9b6",
    } }, h("span", null, card.eyebrow), h("span", null, card.year), h("span", null, card.badge)),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } },
    h("div", { style: { fontSize: "68px", lineHeight: 1.02, fontWeight: 800 } }, card.title),
    h("div", { style: { fontSize: "29px", lineHeight: 1.35, color: "#e3e7da" } }, card.summary))),
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: "24px", color: "#c8d8c7",
    } }, h("span", null, card.genre), h("span", null, card.studio)))), size,
  );
  return Buffer.from(await response.arrayBuffer());
}
