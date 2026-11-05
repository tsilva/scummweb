"use client";

import { createContext, useContext } from "react";

export const GameNavigationContext = createContext(null);

export function useGameNavigation() {
  return useContext(GameNavigationContext);
}
