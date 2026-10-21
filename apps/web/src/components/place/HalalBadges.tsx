"use client";

import {
  CertificateIcon,
  ForkKnifeIcon,
  HandPalmIcon,
  ProhibitIcon,
  QuestionIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
  WineIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { useTranslations } from "next-intl";
import type { Place } from "@/lib/data/types";

function Chip({ icon, children, tone = "neutral" }: { icon: React.ReactNode; children: React.ReactNode; tone?: "neutral" | "halal" | "trust" | "muted" }) {
  return (
    <li
      className={cn(
        // a pill on one line; a long certifier name wraps inside it instead of overflowing
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-[0.875rem] px-2.5 py-1 text-[13px] leading-tight font-medium wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0",
        tone === "neutral" && "bg-foreground/[0.06] text-foreground",
        tone === "halal" && "bg-saffron/22 text-foreground dark:bg-saffron/18",
        tone === "trust" && "bg-leman/12 text-foreground [&_svg]:text-leman",
        tone === "muted" && "bg-foreground/[0.04] text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </li>
  );
}

/**
 * What is halal, who says so, and whether alcohol is served. Each fact is a
 * text chip (icon is decorative), so nothing relies on colour alone.
 */
export function HalalBadges({ place }: { place: Place }) {
  const t = useTranslations("place");
  const level = place.halal_level;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("halalFacts")}>
      <Chip
        tone={level === "unknown" ? "muted" : "halal"}
        icon={level === "unknown" ? <QuestionIcon weight="bold" aria-hidden="true" /> : <ForkKnifeIcon weight="bold" aria-hidden="true" />}
      >
        {t(`halal.${level}`)}
      </Chip>
      {place.certification === "certified" ? (
        <Chip tone="trust" icon={<CertificateIcon weight="bold" aria-hidden="true" />}>
          {place.certifier ? t("certification.certifiedBy", { certifier: place.certifier }) : t("certification.certified")}
        </Chip>
      ) : place.certification === "self_declared" ? (
        <Chip icon={<HandPalmIcon weight="bold" aria-hidden="true" />}>{t("certification.self_declared")}</Chip>
      ) : (
        <Chip icon={<UsersThreeIcon weight="bold" aria-hidden="true" />}>{t("certification.community")}</Chip>
      )}
      {place.certification_verified ? (
        <Chip tone="trust" icon={<ShieldCheckIcon weight="fill" aria-hidden="true" />}>
          {t("certification.verified")}
        </Chip>
      ) : null}
      {place.serves_alcohol === true ? (
        <Chip tone="muted" icon={<WineIcon weight="bold" aria-hidden="true" />}>
          {t("alcohol.yes")}
        </Chip>
      ) : place.serves_alcohol === false ? (
        <Chip tone="muted" icon={<ProhibitIcon weight="bold" aria-hidden="true" />}>
          {t("alcohol.no")}
        </Chip>
      ) : null}
    </ul>
  );
}
