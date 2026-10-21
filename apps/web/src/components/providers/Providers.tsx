"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { UiLabelsProvider } from "@/components/ui/labels";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/auth-context";
import { resolveTheme } from "@/lib/theme";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

/** Keeps the .dark class, the 3D night mode and the system preference in sync. */
function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  const setNight = useWorldStore((s) => s.setNight);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const resolved = resolveTheme(useUiStore.getState().theme);
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.style.colorScheme = resolved;
      setNight(resolved === "dark");
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme, setNight]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeSync />
        <UiLabelsProvider close={t("close")}>
          <TooltipProvider delay={500} closeDelay={0} timeout={400}>
            <Toaster limit={3} closeLabel={t("closeNotification")}>
              {children}
              <AuthDialog />
            </Toaster>
          </TooltipProvider>
        </UiLabelsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
