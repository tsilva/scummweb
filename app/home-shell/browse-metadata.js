"use client";

import { useEffect } from "react";
import { buildGameMetadata, buildGameStructuredData, buildHomeMetadata, buildHomeStructuredData } from "../seo";
import SeoJsonLd from "../seo-json-ld";

export default function BrowseMetadata({ game, catalog, isHomePage }) {
  useEffect(() => {
    const metadata = isHomePage ? buildHomeMetadata() : buildGameMetadata(game);
    document.title = metadata.title;
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", metadata.alternates.canonical);
    const values = { description: metadata.description };
    for (const [prefix, fields] of [["og", metadata.openGraph], ["twitter", metadata.twitter]]) {
      for (const field of ["title", "description", "url"]) {
        if (fields[field]) values[`${prefix}:${field}`] = fields[field];
      }
      const image = fields.images[0];
      values[`${prefix}:image`] = image.url;
      values[`${prefix}:image:alt`] = image.alt;
    }
    for (const element of document.head.querySelectorAll("meta[name], meta[property]")) {
      const value = values[element.getAttribute("name") || element.getAttribute("property")];
      if (value) element.setAttribute("content", value);
    }
  }, [game, isHomePage]);

  return <SeoJsonLd data={isHomePage ? buildHomeStructuredData(catalog) : buildGameStructuredData(game)} />;
}
