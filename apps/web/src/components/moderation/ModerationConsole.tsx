"use client";

import { Tabs } from "@base-ui/react/tabs";
import { ArrowSquareOutIcon, ShieldCheckIcon, SignInIcon } from "@phosphor-icons/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import type { ModerationReport, Place } from "@/lib/data/types";
import { useErrorMessage } from "@/lib/errors";
import { useUiStore } from "@/stores/ui-store";

const card = "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5";
const noteInput =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 sm:max-w-xs";

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
    <a
      href={`/${locale}?spot=${placeId}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowSquareOutIcon className="size-4" aria-hidden="true" />
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

function ReportCard({ report }: { report: ModerationReport }) {
  const t = useTranslations("moderation");
  const tReasons = useTranslations("report.reasons");
  const format = useFormatter();
  const { run, pending } = useRun();
  const [note, setNote] = useState("");
  const mod = getRepository().mod;
  const n = note.trim() || undefined;
  const target = report.review_id ? t("review") : (report.place_name ?? "—");
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
        <blockquote className="rounded-xl bg-muted/60 px-3 py-2 text-sm whitespace-pre-line">{report.review_body}</blockquote>
      ) : null}
      {report.details ? <p className="text-sm whitespace-pre-line">{report.details}</p> : null}
      <p className="text-xs text-muted-foreground">
        {t("reportedBy", { name: report.reporter_name ?? "—" })}
        {report.place_name && report.review_id ? ` · ${report.place_name}` : ""}
        {" · "}
        {t("sameTarget", { count: report.open_reports_for_target })}
      </p>
      <NoteField id={`note-${report.id}`} value={note} onChange={setNote} />
      <div className="flex flex-wrap gap-2">
        {report.place_id ? <MapLink placeId={report.place_id} /> : null}
        {report.review_id ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => mod.setReviewStatus(report.review_id!, "hidden", n))}>
            {t("hideReview")}
          </Button>
        ) : report.place_id && report.place_status === "active" ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => mod.setPlaceStatus(report.place_id!, "hidden", n))}>
            {t("hidePlace")}
          </Button>
        ) : null}
        <Button size="sm" disabled={pending} onClick={() => run(() => mod.resolveReport(report.id, "resolved", n))}>
          {t("resolve")}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => mod.resolveReport(report.id, "dismissed", n))}>
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
        <Button size="sm" disabled={pending} onClick={() => run(() => mod.setPlaceStatus(place.id, "active", n))}>
          {t("restore")}
        </Button>
        {place.certification === "certified" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => mod.verifyCertification(place.id, !place.certification_verified, n))}
          >
            {place.certification_verified ? t("unverify") : t("verify")}
          </Button>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={pending} />}>{t("delete")}</AlertDialogTrigger>
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
  query: { data?: T[]; isLoading: boolean; isError: boolean };
  empty: string;
  render(item: T): React.ReactNode;
}) {
  const t = useTranslations("moderation");
  if (query.isLoading) return <Spinner className="size-6" label="…" />;
  if (query.isError) return <p className="text-sm text-destructive">{t("loadError")}</p>;
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
        <li key={e.id} className="flex flex-col gap-0.5 border-b border-border py-3 last:border-0">
          <p className="text-sm">
            <span className="font-semibold">{t.has(`actions.${e.action}`) ? t(`actions.${e.action}`) : e.action}</span>
            {e.place_name ? ` · ${e.place_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {format.dateTime(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short" })} ·{" "}
            {e.actor_name ? t("by", { name: e.actor_name }) : t("system")}
            {e.note ? ` · “${e.note}”` : ""}
          </p>
        </li>
      )}
    />
  );
}

const TAB_CLASS =
  "relative h-9 rounded-full px-4 text-sm font-medium text-muted-foreground outline-none transition-[color,background-color] duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-popover data-active:text-foreground data-active:shadow-[var(--shadow-float)]";

/** Moderation console; the server enforces every permission, this page only hides what you cannot do. */
export function ModerationConsole() {
  const t = useTranslations("moderation");
  const tAuth = useTranslations("auth");
  const { user, loading, isModerator } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  const [tab, setTab] = useState<"reports" | "removed" | "hidden" | "log">("reports");
  const enabled = Boolean(user && isModerator);
  const reports = useModReports(enabled && tab === "reports");
  const removed = useModPlaces("removed", enabled && tab === "removed");
  const hidden = useModPlaces("hidden", enabled && tab === "hidden");

  if (loading) return <Spinner className="size-6" label="…" />;
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
      <Tabs.List aria-label={t("title")} className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1">
        {(["reports", "removed", "hidden", "log"] as const).map((k) => (
          <Tabs.Tab key={k} value={k} className={TAB_CLASS}>
            {t(`tabs.${k}`)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value="reports" className="outline-none">
        <ListState query={reports} empty={t("emptyReports")} render={(r) => <ReportCard key={r.id} report={r} />} />
      </Tabs.Panel>
      <Tabs.Panel value="removed" className="outline-none">
        <ListState query={removed} empty={t("emptyRemoved")} render={(p) => <PlaceCard key={p.id} place={p} />} />
      </Tabs.Panel>
      <Tabs.Panel value="hidden" className="outline-none">
        <ListState query={hidden} empty={t("emptyHidden")} render={(p) => <PlaceCard key={p.id} place={p} />} />
      </Tabs.Panel>
      <Tabs.Panel value="log" className="outline-none">
        <ActivityLog enabled={enabled && tab === "log"} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
