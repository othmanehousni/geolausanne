"use client";

import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/brand/BrandMark";
import { AccountMenu } from "./AccountMenu";
import { SearchBox } from "./SearchBox";

/** Brand, search and account, floating over the top of the map. */
export function TopBar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const t = useTranslations("common");
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:gap-3 sm:pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))]">
      <h1 className="glass pointer-events-auto flex h-11 shrink-0 items-center gap-2 rounded-full px-2.5 sm:pr-4">
        <BrandMark />
        <span className="sr-only font-brand text-[17px] leading-none tracking-tight sm:not-sr-only">{t("appName")}</span>
      </h1>
      <div className="pointer-events-auto min-w-0 flex-1 md:mx-auto md:max-w-xl">
        <SearchBox inputRef={searchRef} />
      </div>
      <div className="pointer-events-auto shrink-0">
        <AccountMenu />
      </div>
    </header>
  );
}
