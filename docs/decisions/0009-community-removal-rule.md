# 0009. Remove a spot at ≥ 5 downvotes and a score ≤ −5, reversibly

Status: accepted · Date: 2026-10-21

## Context

The product brief: people add halal food spots, others upvote or downvote
them, "which deletes the spot if it's too downvoted". The rule must be simple
enough to explain in one sentence on the about page, hard to abuse by a
handful of accounts, protective of well-known places, and forgiving of
mistakes. Votes must not be confused with halal certification.

## Decision

* A spot is **removed automatically** when it has **at least 5 downvotes and
  a score (up − down) of −5 or less**, evaluated by a trigger after every
  vote. Both numbers are settings.
* Removal is a **soft delete**: the spot disappears from the map and search
  for everyone but its author and moderators, and is **deleted for good after
  14 days**. During that grace period a moderator can **restore** it; a
  restored spot gets a `moderation_lock` so the same campaign cannot remove it
  again (moderators can still remove it by hand).
* Every automatic removal is logged in the moderation audit trail.
* **Votes never change certification.** A spot's certification claim
  (certified / self-declared / community) is shown as such, and only a
  moderator can mark a certificate as verified.
* Anti-abuse: no voting on your own spot, accounts must be 10 minutes old to
  vote, 120 vote changes per hour, and one vote per person and spot (changing
  or clearing it is allowed). Sign-up is rate-limited by Supabase Auth and
  optionally protected by Turnstile.

## Why both thresholds

* "5 downvotes" alone would let five people erase a spot that 200 people
  like.
* "score ≤ −5" alone is the same thing for a spot without upvotes, but makes
  the protection proportional: a spot with 10 upvotes needs 15 downvotes.
* Together they mean: *enough people* think the listing is wrong, *and* the
  community as a whole agrees. The about page and the place panel say it in
  those words, with the numbers taken from the same constants.

## Alternatives

* **Ratio or statistical scores** (e.g. lower bound of a Wilson interval):
  more robust for tiny samples, but not explainable in a sentence and still
  needing a minimum count.
* **Moderator approval before any removal**: safest, but the product asks for
  community-driven removal, and a small volunteer team would become a
  bottleneck.
* **Immediate hard delete**: irreversible after brigading or a
  misunderstanding (a restaurant closed for holidays).
* **Time decay of votes**: a later refinement if old votes start to dominate.

## Consequences

* Values can be changed in `private.settings` without a deployment; the UI
  copy reads the matching constants in `apps/web/src/lib/data/rules.ts`, which
  must be updated at the same time.
* Moderators have a "Removed" tab to review removals within the grace period
  ([moderation guide](../operations/moderation.md)).
* pgTAP tests pin the behaviour (four downvotes do not remove, the fifth does;
  restore locks; purge after the grace period).
