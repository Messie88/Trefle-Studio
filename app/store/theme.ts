import { create } from "zustand";
import { persist } from "zustand/middleware";

import { THEME_STORAGE_KEY } from "@/app/lib/theme-init-script";
import type { ThemeId } from "@/app/lib/themes";

type ThemeState = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "blue",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: THEME_STORAGE_KEY,
      skipHydration: true,
    },
  ),
);
