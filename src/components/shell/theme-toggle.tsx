"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setThemeAction } from "@/app/actions/preferences";

type Theme = "light" | "dark" | "system";

/** Applies the theme instantly; when signed in, also saves it to the profile. */
export function ThemeToggle({ saved, signedIn }: { saved?: Theme; signedIn: boolean }) {
  const t = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    // Apply the saved preference once per browser session (sync across devices).
    if (saved && typeof window !== "undefined" && !sessionStorage.getItem("yala-theme-synced")) {
      sessionStorage.setItem("yala-theme-synced", "1");
      setTheme(saved);
    }
  }, [saved, setTheme]);

  const choose = (value: Theme) => {
    setTheme(value);
    if (signedIn) void setThemeAction(value);
  };
  const Icon = !mounted ? Monitor : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("theme")}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => choose("light")}>
          <Sun /> {t("light")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("dark")}>
          <Moon /> {t("dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("system")}>
          <Monitor /> {t("system")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
