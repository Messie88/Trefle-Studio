import { themes } from "@/app/lib/themes";

export const THEME_STORAGE_KEY = "trefle-theme";

/** Runs before React hydrates to match persisted theme without a flash. */
export function buildThemeInitScript() {
  const tokens = JSON.stringify(themes);

  return `(function(){try{var r=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(!r)return;var p=JSON.parse(r);var id=p&&p.state&&p.state.theme;if(!id)return;var t=${tokens}[id];if(!t)return;var e=document.documentElement;e.dataset.theme=id;e.style.setProperty("--theme-bg-top",t.bgTop);e.style.setProperty("--theme-bg-bottom",t.bgBottom);e.style.setProperty("--theme-fg",t.fg);}catch(e){}})();`;
}
