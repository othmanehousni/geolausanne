"use client";

import { Menu } from "@base-ui/react/menu";
import {
  ArrowSquareOutIcon,
  GavelIcon,
  GithubLogoIcon,
  InfoIcon,
  PencilSimpleIcon,
  SignInIcon,
  SignOutIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ProfileDialog } from "@/components/auth/ProfileDialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { useAuth } from "@/lib/auth/auth-context";
import { initials } from "@/lib/initials";
import type { ThemePreference } from "@/lib/theme";
import { REPO_URL } from "@/lib/site";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

const itemLink =
  "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent [&_svg]:size-4 [&_svg]:shrink-0";

/** Account, appearance, language and site links. Open to everyone; sign-in lives here too. */
export function AccountMenu() {
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isModerator, demo, signOut } = useAuth();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const openAuth = useUiStore((s) => s.openAuth);
  const motionPaused = useWorldStore((s) => s.motionPaused);
  const setMotionPaused = useWorldStore((s) => s.setMotionPaused);
  const [profileOpen, setProfileOpen] = useState(false);

  const name = profile?.display_name ?? user?.email ?? null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={user ? `${tAuth("account")}: ${name}` : tAuth("account")}
          className="glass grid size-11 place-items-center rounded-full outline-none transition-[scale] duration-150 ease-out active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/80 motion-reduce:active:scale-100"
        >
          {user && name && initials(name) ? (
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full bg-leman text-[13px] font-semibold text-primary-foreground tabular-nums"
            >
              {initials(name)}
            </span>
          ) : (
            <UserCircleIcon className="size-6 text-foreground/80" aria-hidden="true" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl p-1.5">
          {user ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5 px-1.5 py-1.5">
                <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                {user.email && user.email !== name ? <span className="truncate text-xs font-normal">{user.email}</span> : null}
                {demo ? <span className="text-xs font-normal text-saffron-foreground dark:text-saffron">{t("demoMode")}</span> : null}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <PencilSimpleIcon aria-hidden="true" />
                {tAuth("displayName")}
              </DropdownMenuItem>
              {isModerator ? (
                <Menu.LinkItem render={<Link href="/moderation" />} className={itemLink}>
                  <GavelIcon aria-hidden="true" />
                  {t("moderation")}
                </Menu.LinkItem>
              ) : null}
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuItem onClick={() => openAuth(null)} className="font-semibold">
              <SignInIcon aria-hidden="true" />
              {tAuth("signIn")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
              {(["system", "light", "dark"] as const).map((v) => (
                <DropdownMenuRadioItem key={v} value={v} closeOnClick={false}>
                  {t(`themes.${v}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {/* stops the water and makes camera moves and panels instant (WCAG 2.2.2, 2.3.3);
                rendered only while the menu is open, so the stored choice never meets server HTML */}
            <DropdownMenuCheckboxItem checked={motionPaused} onCheckedChange={setMotionPaused} closeOnClick={false}>
              {t("reduceMotion")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(v) => {
                if (v === locale) return;
                router.replace(`${pathname}${window.location.search}`, { locale: v as Locale });
              }}
            >
              {routing.locales.map((l) => (
                <DropdownMenuRadioItem key={l} value={l} lang={l}>
                  {t(`languages.${l}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <Menu.LinkItem render={<Link href="/about" />} className={itemLink}>
              <InfoIcon aria-hidden="true" />
              {t("about")}
            </Menu.LinkItem>
            <Menu.LinkItem render={<Link href="/privacy" />} className={itemLink}>
              <span className="size-4" aria-hidden="true" />
              {t("privacy")}
            </Menu.LinkItem>
            <Menu.LinkItem render={<Link href="/terms" />} className={itemLink}>
              <span className="size-4" aria-hidden="true" />
              {t("terms")}
            </Menu.LinkItem>
            <Menu.LinkItem href={REPO_URL} target="_blank" rel="noopener noreferrer" className={itemLink}>
              <GithubLogoIcon aria-hidden="true" />
              {t("sourceCode")}
              <ArrowSquareOutIcon className="ml-auto text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{t("opensInNewTab")}</span>
            </Menu.LinkItem>
          </DropdownMenuGroup>
          {user ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  toast.add({ title: tAuth("signedOut"), type: "success" });
                }}
              >
                <SignOutIcon aria-hidden="true" />
                {tAuth("signOut")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
