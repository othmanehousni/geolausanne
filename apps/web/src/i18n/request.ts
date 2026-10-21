import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  // `locale` is set when a server function passes it explicitly; otherwise
  // read the [locale] root param, which keeps every page statically renderable.
  const resolved = locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, resolved)) notFound();
  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
    timeZone: "Europe/Zurich",
  };
});
