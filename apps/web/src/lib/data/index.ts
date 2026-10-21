import { DemoRepository } from "./demo-repository";
import type { OAuthProvider, Repository } from "./repository";
import { createSupabaseRepository } from "./supabase-repository";

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
  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is OAuthProvider => p === "google" || p === "github");
  repo = url && key ? createSupabaseRepository(url, key, providers) : new DemoRepository();
  return repo;
}

/** For tests only. */
export function setRepository(r: Repository | null) {
  repo = r;
}
