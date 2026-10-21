# Moderation guide

The community does most of the work: wrong spots are removed by votes
([the rule](../decisions/0009-community-removal-rule.md)). Moderators handle
what votes cannot: reports, mistakes in removals, certificates, abuse.

## Roles

| Role | Can |
| --- | --- |
| user | add spots (5/day), vote (after 10 min, 120 changes/hour), review (20/day), report (20/day), edit own spots for 7 days |
| moderator | everything in the console below; suspend plain users |
| admin | also grant roles and suspend moderators |

### Making someone a moderator

There is no role screen on purpose (rarely needed, high impact). In the
Supabase SQL editor (it runs as `postgres`, which the profile guard allows):

```sql
-- first admin: yourself, after signing in once on the site
update public.profiles set role = 'admin'
 where id = (select id from auth.users where email = 'you@example.org');

-- a moderator
update public.profiles set role = 'moderator'
 where id = (select id from auth.users where email = 'volunteer@example.org');

-- back to a normal user
update public.profiles set role = 'user' where id = '<user uuid>';
```

Role changes are effective at the person's next request (no new sign-in
needed). Record them in the moderation log by hand if you want a trace:
`insert into public.moderation_events (actor_id, action, target_user_id, note) values (null, 'role_moderator', '<uuid>', 'by …');`

## The console

Account menu → **Moderation** (`/fr/moderation`, `/en/moderation`). Every
action accepts a short note, and every action lands in the **log**.

| Tab | Shows | Actions |
| --- | --- | --- |
| Reports | open reports, oldest first, with the target (spot or review), reason, details, reporter's display name, and how many open reports the same target has | hide the review, hide the spot, **resolve**, **dismiss** |
| Removed | spots removed by votes or by moderators, with the removal date; they are deleted for good 14 days after removal | **restore** (protects the spot from further automatic removal), verify certificate, **delete now** (with confirmation) |
| Hidden | spots hidden by moderators | restore, verify certificate, delete |
| Log | every moderation action and automatic removal or purge, newest first | – |

In the spot panel, moderators also see **moderator tools**: verify or
unverify the certificate, hide the spot, restore it.

## Guidelines per report reason

| Reason | Check | Typical outcome |
| --- | --- | --- |
| Not halal | reviews and confirmations, the spot's own claims (website, certificate), ask the reporter for details in doubt | correct the halal level/claim (via the author or SQL), or hide; never "verify" without seeing a certificate |
| Closed | website, recent reviews, a visit | hide (removed spots and hidden spots disappear from the map alike) |
| Wrong location | compare with swisstopo / OSM | edit the location in SQL, or hide and ask for a resubmission |
| Duplicate | the two spots | hide the newer one, keep the one with more history |
| Spam, offensive | the content | hide the review or spot; suspend repeat offenders |
| Other | read the details | use judgement, write a note |

**Certificates.** "Verified" means a moderator saw a valid certificate from a
recognised body (photo sent by the owner, the certifier's public list, or a
visit). Note the source in the action's note. Unverify when a certificate
expires or is withdrawn. Votes never change this flag.

**Restoring a removal.** Look at who downvoted and why (reports, reviews). A
legitimate spot removed by a coordinated campaign should be restored; the
restore sets a lock so the same campaign cannot remove it again. If the spot
really is wrong, let it expire or delete it now.

**Suspensions.** `mod_ban_user(user_id, until, note)` blocks writes until a
date (reading stays possible). From the SQL editor:

```sql
update public.profiles set banned_until = now() + interval '30 days'
 where id = '<user uuid>';
```

Prefer short suspensions first. Admins can suspend moderators.

## Changing the rules

Thresholds and limits are rows in `private.settings` (SQL editor):

```sql
update private.settings set value = '7' where key = 'removal_min_downvotes';
update private.settings set value = '-7' where key = 'removal_max_score';
```

Then update `apps/web/src/lib/data/rules.ts` so the about page and the spot
panel describe the new rule, and redeploy. Existing spots are re-evaluated at
their next vote.

## Daily routine (a few minutes)

1. Open the Reports tab; resolve or dismiss each report with a note.
2. Skim the Removed tab for anything removed in error (within 14 days).
3. Glance at the Log for unusual bursts (many removals at once, one account
   reporting everything).
