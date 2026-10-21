/** Display preferences shared by the no-flash inline script and the React toggles. */
export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "geolausanne-theme";
/** "1" when the visitor turned on Reduce motion in the account menu */
export const MOTION_STORAGE_KEY = "geolausanne-motion-paused";
/** browser UI colour (theme-color) for each theme: the page background */
export const THEME_COLORS = { light: "#f8f7f3", dark: "#0d0e12" } as const;

/**
 * Runs before first paint (inline <script>): applies the .dark class and the
 * visitor's Reduce motion choice (data-reduce-motion, read by the CSS).
 */
export const themeScript = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';if(localStorage.getItem('${MOTION_STORAGE_KEY}')==='1')e.setAttribute('data-reduce-motion','');}catch(e){}})();`;

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePreference) {
  const theme = resolveTheme(pref);
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // storage may be unavailable (private mode); the class is still applied
  }
}

/**
 * The browser's UI colour follows the theme chosen here, not only the
 * system one: both theme-color tags (light and dark media) get the chosen
 * colour, or their own back when following the system.
 */
export function syncThemeColor(pref: ThemePreference) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[pref === "system" ? own : pref];
  }
}
