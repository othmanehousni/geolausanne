import { DemoRepository } from "./demo-repository";
import type { OAuthProvider, Repository, SignInMethods } from "./repository";
import { createSupabaseRepository } from "./supabase-repository";

/**
 * The sign-in methods to offer, from NEXT_PUBLIC_AUTH_PROVIDERS: a comma
 * separated list of `email`, `google` and `github`. Unset (or nothing usable
 * listed): e-mail links only. Supabase's built-in mailer only reaches the
 * project's team, so a site without its own SMTP server lists only the OAuth
 * providers it set up.
 */
export function signInMethods(list: string | undefined): SignInMethods {
  const names = new Set(
    (list ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  );
  const providers = [...names].filter((p): p is OAuthProvider => p === "google" || p === "github");
  return { emailSignIn: names.has("email") || providers.length === 0, providers };
}

let repo: Repository | null = null;

/** True when a Supabase project is configured (otherwise demo mode). */
export const hasBackend = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);

export function getRepository(): Repository {
  if (repo) return repo;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  repo =
    url && key
      ? createSupabaseRepository(url, key, signInMethods(process.env.NEXT_PUBLIC_AUTH_PROVIDERS))
      : new DemoRepository();
  return repo;
}

/** For tests only. */
export function setRepository(r: Repository | null) {
  repo = r;
}
