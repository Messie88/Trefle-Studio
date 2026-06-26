"use client";

import { useEffect, useState, type PropsWithChildren } from "react";

import { applyThemeToDocument } from "@/app/lib/themes";
import { useThemeStore } from "@/app/store/theme";

export default function ThemeProvider({ children }: PropsWithChildren) {
  const theme = useThemeStore((s) => s.theme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const finish = () => {
      setReady(true);
      applyThemeToDocument(useThemeStore.getState().theme);
    };

    const unsub = useThemeStore.persist.onFinishHydration(finish);

    if (useThemeStore.persist.hasHydrated()) {
      finish();
    } else {
      void useThemeStore.persist.rehydrate();
    }

    return unsub;
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyThemeToDocument(theme);
  }, [theme, ready]);

  return children;
}
