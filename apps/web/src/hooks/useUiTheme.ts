import { useSyncExternalStore } from "react";

export type UiThemeId = "default" | "robo" | "skeleton" | string;

export interface UiThemeDefinition {
  readonly id: UiThemeId;
  readonly label: string;
  readonly description: string;
  readonly isLive?: boolean;
}

export const UI_THEMES: ReadonlyArray<UiThemeDefinition> = [
  {
    id: "default",
    label: "Default",
    description: "Classic Codey interface",
    isLive: false,
  },
  {
    id: "robo",
    label: "Robo",
    description: "Interactive 3D robot with liquid glass",
    isLive: true,
  },
  {
    id: "skeleton",
    label: "Skeleton",
    description: "Skeleton Warrior live wallpaper with liquid glass",
    isLive: true,
  },
];

export const UI_THEME_STORAGE_KEY = "codey:ui-theme";
export const DEFAULT_UI_THEME: UiThemeId = "skeleton";

let currentUiTheme: UiThemeId = (() => {
  if (typeof window === "undefined") return DEFAULT_UI_THEME;
  try {
    const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    if (stored && stored !== "robo") return stored;
  } catch {}
  return DEFAULT_UI_THEME;
})();

const listeners = new Set<() => void>();

export function applyUiThemeToDom(theme: UiThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiTheme = theme;
  const isLive = theme === "robo" || theme === "skeleton";
  document.documentElement.dataset.liveBackground = isLive ? "true" : "false";
}

// Apply immediately on load
if (typeof window !== "undefined") {
  applyUiThemeToDom(currentUiTheme);
}

export function setUiTheme(theme: UiThemeId): void {
  if (currentUiTheme === theme) return;
  currentUiTheme = theme;
  try {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  } catch {}
  applyUiThemeToDom(theme);
  listeners.forEach((listener) => listener());
}

export function getUiTheme(): UiThemeId {
  return currentUiTheme;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useUiTheme() {
  const activeUiTheme = useSyncExternalStore(subscribe, getUiTheme, () => DEFAULT_UI_THEME);
  return {
    uiTheme: activeUiTheme,
    setUiTheme,
    availableUiThemes: UI_THEMES,
  };
}

