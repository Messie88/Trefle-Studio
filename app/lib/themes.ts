export type ThemeId = "blue" | "red" | "amber";

export type ThemeTokens = {
  bgTop: string;
  bgBottom: string;
  fg: string;
  /** Shader line ink as normalized RGB 0–1 */
  ink: [number, number, number];
};

export const themes: Record<ThemeId, ThemeTokens> = {
  blue: {
    bgTop: "#061840",
    bgBottom: "#1A4486",
    fg: "#FEF1C5",
    ink: [0.8314, 0.7725, 0.9961],
  },
  red: {
    bgTop: "#A02615",
    bgBottom: "#D67764",
    fg: "#fef1c5",
    ink: [0.9961, 0.9451, 0.7725],
  },
  amber: {
    bgTop: "#FFA04D",
    bgBottom: "#FFC83D",
    fg: "#FFFEFD",
    ink: [222, 121, 22],
  },
};

export const themeOrder: ThemeId[] = ["blue", "red", "amber"];

export const themeLabels: Record<ThemeId, string> = {
  blue: "Thème bleu",
  red: "Thème rouge",
  amber: "Thème ambre",
};

export const themeSwatchClass: Record<ThemeId, string> = {
  blue: "bg-blue",
  red: "bg-red",
  amber: "bg-amber",
};

export function hexToRgbNormalized(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

export function applyThemeToDocument(themeId: ThemeId) {
  const theme = themes[themeId];
  const root = document.documentElement;

  root.style.setProperty("--theme-bg-top", theme.bgTop);
  root.style.setProperty("--theme-bg-bottom", theme.bgBottom);
  root.style.setProperty("--theme-fg", theme.fg);
  root.dataset.theme = themeId;
}
