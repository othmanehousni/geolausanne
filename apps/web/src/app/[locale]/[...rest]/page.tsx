import { notFound } from "next/navigation";

/** Any unknown path below /fr or /en renders the localized not-found page. */
export default function CatchAll() {
  notFound();
}
