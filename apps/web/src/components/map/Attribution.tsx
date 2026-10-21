"use client";

import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";

const link = "whitespace-nowrap underline decoration-foreground/25 underline-offset-2 transition-colors duration-150 hover:text-foreground hover:decoration-foreground/60";

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
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
      <p className="glass rounded-full px-2.5 py-1 shadow-none">
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
        {"\u00a0· "}
        <Link href="/about" className={link}>
          {t("about")}
        </Link>
      </p>
      {demo ? (
        <Popover>
          <PopoverTrigger className="glass rounded-full px-2.5 py-1 font-pixel text-[10.5px] tracking-[0.1em] text-foreground uppercase shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("demoMode")}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-64 text-sm text-pretty">
            {t("demoModeHint")}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
