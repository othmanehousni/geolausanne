"use client";

import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";

const link = "underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground";

/**
 * Data credits required by the licences (swisstopo OGD: "© swisstopo";
 * OpenStreetMap ODbL: "© OpenStreetMap contributors" with a link), plus the
 * demo-mode notice when no backend is configured.
 */
export function Attribution() {
  const t = useTranslations("common");
  const tMap = useTranslations("map");
  const { demo } = useAuth();
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 text-[11px] leading-tight text-foreground/75">
      <p className="glass rounded-full px-2.5 py-1">
        {tMap.rich("attribution", {
          swisstopo: (chunks) => (
            <a href="https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices" target="_blank" rel="noopener noreferrer" className={link}>
              {chunks}
            </a>
          ),
          osm: (chunks) => (
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className={link}>
              {chunks}
            </a>
          ),
        })}
        {" · "}
        <Link href="/about" className={link}>
          {t("about")}
        </Link>
      </p>
      {demo ? (
        <Popover>
          <PopoverTrigger className="glass rounded-full px-2.5 py-1 font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {t("demoMode")}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-64 rounded-xl p-3 text-sm">
            {t("demoModeHint")}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
