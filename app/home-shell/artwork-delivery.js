"use client";

import { createContext, useContext } from "react";
import { artworkStorage } from "../../lib/artwork-storage.mjs";

export const ArtworkDelivery = createContext(null);

export function useArtworkDelivery() {
  return useContext(ArtworkDelivery) ?? artworkStorage;
}
