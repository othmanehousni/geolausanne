"use client";

import { useAnnouncer } from "@/stores/announcer-store";

/** Single polite live region for map announcements. */
export function LiveRegion() {
  const message = useAnnouncer((s) => s.message);
  const nonce = useAnnouncer((s) => s.nonce);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {/* a zero-width suffix makes a repeated sentence a new text node */}
      {message ? message + (nonce % 2 ? "​" : "") : ""}
    </div>
  );
}
