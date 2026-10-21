"use client";

import { Tabs } from "@base-ui/react/tabs";
import { ArrowSquareOutIcon, ShieldCheckIcon, SignInIcon } from "@phosphor-icons/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";
import { getRepository } from "@/lib/data";
import { useModAction, useModEvents, useModPlaces, useModReports } from "@/lib/data/mod-hooks";
import { REMOVAL_GRACE_DAYS } from "@/lib/data/rules";
import { cn } from "cn";
import type { ModerationReport, Place } from "@/lib/data/types";
import { useErrorMessage } from "@/lib/errors";
import { useUiStore } from "@/stores/ui-store";

const card = "flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-[var(--shadow-float)] sm:p-5";
const noteInput =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 text-base outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 sm:max-w-xs md:text-sm";
/** Card actions: compact with a mouse, 40 px tall on touch screens. */
const action = "pointer-coarse:h-10";
const SUSPENSION_DAYS = [7, 30] as const;

/** Shared runner: executes a moderation call, toasts the outcome. */
function useRun() {
  const t = useTranslations("moderation");
  const action = useModAction();
  const errorMessage = useErrorMessage();
  return {
    pending: action.isPending,
    run: (fn: () => Promise<unknown>) =>
      action.mutate(fn, {
        onSuccess: () => toast.add({ title: t("done"), type: "success" }),
        onError: (err) => toast.add({ title: errorMessage(err), type: "error" }),
      }),
  };
}

function MapLink({ placeId }: { placeId: string }) {
  const t = useTranslations("moderation");
  const locale = useLocale();
  return (
    <a href={`/${locale}?spot=${placeId}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), action)}>
      <ArrowSquareOutIcon weight="bold" aria-hidden="true" />
      {t("openOnMap")}
    </a>
  );
}

function NoteField({ id, value, onChange }: { id: string; value: string; onChange(v: string): void }) {
  const t = useTranslations("moderation");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {t("note")}
      </label>
      <input id={id} className={noteInput} value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Suspend (7 or 30 days) or reinstate the author of a reported spot or review. */
function SuspendAuthor({ report, note, run, pending }: { report: ModerationReport; note?: string; run: ReturnType<typeof useRun>["run"]; pending: boolean }) {
  const t = useTranslations("moderation");
  const tCommon = useTranslations("common");
  const mod = getRepository().mod;
  const name = report.author_name ?? "—";
  if (!report.can_suspend_author) return null;
  if (report.author_suspended) {
    return (
      <Button variant="secondary" size="sm" className={action} disabled={pending} onClick={() => run(() => mod.suspendAuthor(report.id, 0, note))}>
        {t("liftSuspension")}
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="secondary" size="sm" className={action} disabled={pending} />}>{t("suspendAuthor")}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t("suspendTitle", { name })}</AlertDialogTitle>
        <AlertDialogDescription>{t("suspendDescription")}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          {SUSPENSION_DAYS.map((days) => (
            <AlertDialogCancel key={days} variant="destructive" onClick={() => run(() => mod.suspendAuthor(report.id, days, note))}>
              {t("suspendFor", { days })}
            </AlertDialogCancel>
          ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReportCard({ report }: { report: ModerationReport }) {
  const t = useTranslations("moderation");
  const tReasons = useTranslations("report.reasons");
  const format = useFormatter();
  const { run, pending } = useRun();
  const [note, setNote] = useState("");
  const mod = getRepository().mod;
  const n = note.trim() || undefined;
  const target = report.is_review ? t("review") : (report.place_name ?? "—");
  return (
    <li className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          <span className="mr-2 inline-flex rounded-full bg-downvote/12 px-2 py-0.5 text-xs font-semibold text-foreground">
            {tReasons(report.reason)}
          </span>
          {t("reportFor", { target })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("reportedAt", { date: format.dateTime(new Date(report.created_at), { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
      </div>
      {report.review_body ? (
        <figure className="flex flex-col gap-1">
          <blockquote className="rounded-[12px] bg-foreground/[0.04] px-3 py-2 text-sm whitespace-pre-line wrap-anywhere">{report.review_body}</blockquote>
          {report.review_deleted ? <figcaption className="text-xs text-muted-foreground">{t("reviewDeleted")}</figcaption> : null}
        </figure>
      ) : null}
      {report.details ? <p className="text-sm whitespace-pre-line wrap-anywhere">{report.details}</p> : null}
      <p className="text-xs text-muted-foreground">
        {t("reportedBy", { name: report.reporter_name ?? "—" })}
        {report.place_name && report.is_review ? ` · ${report.place_name}` : ""}
        {" · "}
        {t("sameTarget", { count: report.open_reports_for_target })}
      </p>
      {report.author_name ? (
        <p className="text-xs text-muted-foreground">
          {t("postedBy", { name: report.author_name })}
          {report.author_suspended && report.author_banned_until ? ` · ${t("suspendedUntil", { date: format.dateTime(new Date(report.author_banned_until), { dateStyle: "medium" }) })}` : ""}
        </p>
      ) : null}
      <NoteField id={`note-${report.id}`} value={note} onChange={setNote} />
      <div className="flex flex-wrap gap-2">
        {report.place_id ? <MapLink placeId={report.place_id} /> : null}
        {report.is_review ? (
          report.review_id ? (
            <Button variant="secondary" size="sm" className={action} disabled={pending} onClick={() => run(() => mod.setReviewStatus(report.review_id!, "hidden", n))}>
              {t("hideReview")}
            </Button>
          ) : null
        ) : report.place_id && report.place_status === "active" ? (
          <Button variant="secondary" size="sm" className={action} disabled={pending} onClick={() => run(() => mod.setPlaceStatus(report.place_id!, "hidden", n))}>
            {t("hidePlace")}
          </Button>
        ) : null}
        <SuspendAuthor report={report} note={n} run={run} pending={pending} />
        <Button size="sm" className={action} disabled={pending} onClick={() => run(() => mod.resolveReport(report.id, "resolved", n))}>
          {t("resolve")}
        </Button>
        <Button variant="ghost" size="sm" className={action} disabled={pending} onClick={() => run(() => mod.resolveReport(report.id, "dismissed", n))}>
          {t("dismiss")}
        </Button>
      </div>
    </li>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const t = useTranslations("moderation");
  const tPlace = useTranslations("place");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const { run, pending } = useRun();
  const [note, setNote] = useState("");
  const mod = getRepository().mod;
  const n = note.trim() || undefined;
  return (
    <li className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{place.name}</h3>
        <p className="text-xs text-muted-foreground">
          {[tPlace(`categories.${place.category}`), place.address].filter(Boolean).join(" · ")}
        </p>
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("score", { score: place.score, up: place.upvotes, down: place.downvotes })}
        {place.removed_at ? ` · ${t("removedOn", { date: format.dateTime(new Date(place.removed_at), { dateStyle: "medium" }) })}` : ""}
      </p>
      {place.status === "removed" ? <p className="text-xs text-muted-foreground">{t("purgeOn", { days: REMOVAL_GRACE_DAYS })}</p> : null}
      {place.certification === "certified" ? (
        <p className="flex items-center gap-1.5 text-sm">
          <ShieldCheckIcon className="size-4 text-leman" weight={place.certification_verified ? "fill" : "regular"} aria-hidden="true" />
          {t("certifiedBy", { certifier: place.certifier ?? "—" })}
        </p>
      ) : null}
      <NoteField id={`note-${place.id}`} value={note} onChange={setNote} />
      <div className="flex flex-wrap gap-2">
        <MapLink placeId={place.id} />
        <Button size="sm" className={action} disabled={pending} onClick={() => run(() => mod.setPlaceStatus(place.id, "active", n))}>
          {t("restore")}
        </Button>
        {place.certification === "certified" ? (
          <Button
            variant="secondary"
            size="sm"
            className={action}
            disabled={pending}
            onClick={() => run(() => mod.verifyCertification(place.id, !place.certification_verified, n))}
          >
            {place.certification_verified ? t("unverify") : t("verify")}
          </Button>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" size="sm" className={action} disabled={pending} />}>{t("delete")}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm", { name: place.name })}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogCancel variant="destructive" onClick={() => run(() => mod.deletePlace(place.id, n))}>
                {t("delete")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function ListState<T>({
  query,
  empty,
  render,
}: {
  query: { data?: T[]; isPending: boolean; isPaused: boolean; isError: boolean };
  empty: string;
  render(item: T): React.ReactNode;
}) {
  const t = useTranslations("moderation");
  const tCommon = useTranslations("common");
  // offline, the request waits (paused): that is not an empty queue
  if (query.isPending && query.isPaused) return <p className="py-6 text-sm text-muted-foreground">{tCommon("offline")}</p>;
  if (query.isError && !query.data) return <p className="text-sm text-destructive">{t("loadError")}</p>;
  if (query.isPending) return <Spinner className="size-6" label={tCommon("loading")} />;
  if (!query.data?.length) return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  return <ul className="flex flex-col gap-3">{query.data.map(render)}</ul>;
}

function ActivityLog({ enabled }: { enabled: boolean }) {
  const t = useTranslations("moderation");
  const format = useFormatter();
  const events = useModEvents(enabled);
  return (
    <ListState
      query={events}
      empty={t("emptyLog")}
      render={(e) => (
        <li key={e.id} className="flex flex-col gap-0.5 border-b border-foreground/[0.07] py-3 last:border-0">
          <p className="text-sm">
            <span className="font-semibold">{t.has(`actions.${e.action}`) ? t(`actions.${e.action}`) : e.action}</span>
            {e.place_name ? ` · ${e.place_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground wrap-anywhere">
            {format.dateTime(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short" })} ·{" "}
            {e.actor_name ? t("by", { name: e.actor_name }) : t("system")}
            {e.note ? ` · “${e.note}”` : ""}
          </p>
        </li>
      )}
    />
  );
}

/** Tab panels take focus (Tab from the tab list lands on them): show it. */
const PANEL_CLASS = "rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TAB_CLASS =
  "relative h-9 shrink-0 rounded-full border border-transparent px-4 text-sm font-medium text-muted-foreground outline-none transition-[color,background-color] duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-card data-active:text-foreground data-active:shadow-[var(--shadow-float)] data-active:forced-colors:bg-[Highlight] data-active:forced-colors:text-[HighlightText] data-active:forced-colors:forced-color-adjust-none";

/** Moderation console; the server enforces every permission, this page only hides what you cannot do. */
export function ModerationConsole() {
  const t = useTranslations("moderation");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const { user, loading, isModerator } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  const [tab, setTab] = useState<"reports" | "removed" | "hidden" | "log">("reports");
  const enabled = Boolean(user && isModerator);
  const reports = useModReports(enabled && tab === "reports");
  const removed = useModPlaces("removed", enabled && tab === "removed");
  const hidden = useModPlaces("hidden", enabled && tab === "hidden");

  if (loading) return <Spinner className="size-6" label={tCommon("loading")} />;
  if (!user)
    return (
      <div className="flex flex-col items-start gap-3">
        <p>{t("signInPrompt")}</p>
        <Button className="h-10 rounded-full px-4" onClick={() => openAuth(null)}>
          <SignInIcon aria-hidden="true" />
          {tAuth("signIn")}
        </Button>
      </div>
    );
  if (!isModerator) return <p role="alert">{t("notAllowed")}</p>;

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex flex-col gap-6">
      <Tabs.List aria-label={t("title")} className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-foreground/[0.055] p-[3px]">
        {(["reports", "removed", "hidden", "log"] as const).map((k) => (
          <Tabs.Tab key={k} value={k} className={TAB_CLASS}>
            {t(`tabs.${k}`)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="reports" className={PANEL_CLASS}>
        <ListState query={reports} empty={t("emptyReports")} render={(r) => <ReportCard key={r.id} report={r} />} />
      </Tabs.Panel>
      <Tabs.Panel value="removed" className={PANEL_CLASS}>
        <ListState query={removed} empty={t("emptyRemoved")} render={(p) => <PlaceCard key={p.id} place={p} />} />
      </Tabs.Panel>
      <Tabs.Panel value="hidden" className={PANEL_CLASS}>
        <ListState query={hidden} empty={t("emptyHidden")} render={(p) => <PlaceCard key={p.id} place={p} />} />
      </Tabs.Panel>
      <Tabs.Panel value="log" className={PANEL_CLASS}>
        <ActivityLog enabled={enabled && tab === "log"} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
