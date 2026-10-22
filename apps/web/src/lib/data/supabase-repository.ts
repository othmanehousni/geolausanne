import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthAdapter, AuthUser, ModerationApi, Repository, SignInMethods } from "./repository";
import {
  BackendError,
  type BackendErrorCode,
  type Bounds,
  type ModerationEvent,
  type ModerationReport,
  type NewPlaceInput,
  type Place,
  type PlaceStatus,
  type Profile,
  type ReportInput,
  type Review,
  type ReviewInput,
  type VoteValue,
} from "./types";

const KNOWN: BackendErrorCode[] = [
  "not_authenticated",
  "account_suspended",
  "account_too_new",
  "rate_limited",
  "duplicate_place",
  "recently_removed",
  "outside_service_area",
  "invalid_name",
  "own_place",
  "not_found",
  "forbidden",
  "confirmation_method_required",
];

export function toBackendError(err: PostgrestError | Error | null | undefined): BackendError {
  if (!err) return new BackendError("unknown");
  const message = "message" in err ? err.message : String(err);
  const code = KNOWN.find((k) => message === k || message.startsWith(`${k}`));
  if (code) return new BackendError(code, message, "details" in err ? (err.details ?? undefined) : undefined);
  if ("code" in err && err.code === "42501") return new BackendError("forbidden", message);
  if (/fetch|network|Failed to fetch/i.test(message)) return new BackendError("network", message);
  return new BackendError("unknown", message);
}

async function rpc<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw toBackendError(error);
  return data as T;
}

function supabaseAuth(client: SupabaseClient, { providers, emailSignIn }: SignInMethods): AuthAdapter {
  const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? null } : null;
  return {
    providers,
    emailSignIn,
    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signInWithEmail(email, redirectTo, captchaToken) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true, captchaToken },
      });
      if (error) throw new BackendError(error.status === 429 ? "rate_limited" : "unknown", error.message);
      return { instant: false };
    },
    async signInWithOAuth(provider, redirectTo) {
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw new BackendError("unknown", error.message);
    },
    async signOut() {
      await client.auth.signOut();
    },
    async profile() {
      const rows = await rpc<Profile[]>(client, "my_profile");
      return rows[0] ?? null;
    },
    async updateDisplayName(name) {
      await rpc(client, "update_my_profile", { p_display_name: name });
    },
  };
}

function moderation(client: SupabaseClient): ModerationApi {
  return {
    reports: (status = "open") => rpc<ModerationReport[]>(client, "mod_list_reports", { p_status: status }),
    resolveReport: (id, status, note) => rpc(client, "mod_resolve_report", { p_report_id: id, p_status: status, p_note: note ?? null }),
    places: (status: PlaceStatus) => rpc<Place[]>(client, "mod_list_places", { p_status: status }),
    setPlaceStatus: (id, status, note) =>
      rpc<Place>(client, "mod_set_place_status", { p_place_id: id, p_status: status, p_note: note ?? null }),
    verifyCertification: (id, verified, note) =>
      rpc<Place>(client, "mod_verify_certification", { p_place_id: id, p_verified: verified, p_note: note ?? null }),
    deletePlace: (id, note) => rpc(client, "mod_delete_place", { p_place_id: id, p_note: note ?? null }),
    setReviewStatus: (id, status, note) => rpc(client, "mod_set_review_status", { p_review_id: id, p_status: status, p_note: note ?? null }),
    events: () => rpc<ModerationEvent[]>(client, "mod_list_events", { max_results: 100 }),
    banUser: (userId, until, note) => rpc(client, "mod_ban_user", { p_user_id: userId, p_until: until, p_note: note ?? null }),
    suspendAuthor: (reportId, days, note) =>
      rpc<string | null>(client, "mod_suspend_author", { p_report_id: reportId, p_days: days, p_note: note ?? null }),
    setRole: (userId, role) => rpc(client, "admin_set_role", { p_user_id: userId, p_role: role }),
  };
}

export function createSupabaseRepository(url: string, key: string, methods: SignInMethods): Repository {
  const client = createClient(url, key, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return {
    mode: "supabase",
    placesInBounds: (b: Bounds, limit = 400) =>
      rpc<Place[]>(client, "places_in_bbox", { west: b.west, south: b.south, east: b.east, north: b.north, max_results: limit }),
    async place(id) {
      // a mistyped ?spot= link is "not found", not an invalid-uuid database error
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
      const p = await rpc<Place | null>(client, "place_detail", { place_id: id });
      return p && p.id ? p : null;
    },
    search: (query) => rpc<Place[]>(client, "search_places", { query, max_results: 8 }),
    nearby: (lon, lat, radiusM) => rpc<Place[]>(client, "nearby_places", { lon, lat, radius_m: radiusM }),
    createPlace: (i: NewPlaceInput) =>
      rpc<Place>(client, "create_place", {
        p_name: i.name,
        p_lon: i.lon,
        p_lat: i.lat,
        p_category: i.category,
        p_cuisine: i.cuisine,
        p_elevation: i.elevation,
        p_address: i.address,
        p_website: i.website,
        p_phone: i.phone,
        p_opening_hours: i.opening_hours,
        p_description: i.description,
        p_halal_level: i.halal_level,
        p_certification: i.certification,
        p_certifier: i.certifier,
        p_serves_alcohol: i.serves_alcohol,
      }),
    vote: (placeId: string, value: VoteValue) => rpc<Place>(client, "cast_vote", { p_place_id: placeId, p_value: value }),
    reviews: (placeId) => rpc<Review[]>(client, "list_reviews", { place_id: placeId, max_results: 100 }),
    upsertReview: (r: ReviewInput) =>
      rpc(client, "upsert_review", {
        p_place_id: r.placeId,
        p_rating: r.rating,
        p_body: r.body,
        p_halal_confirmed: r.halalConfirmed,
        p_confirmation_method: r.halalConfirmed ? r.confirmationMethod : null,
      }),
    deleteMyReview: (placeId) => rpc(client, "delete_my_review", { p_place_id: placeId }),
    report: (r: ReportInput) =>
      rpc(client, "submit_report", {
        p_reason: r.reason,
        p_place_id: r.placeId ?? null,
        p_review_id: r.reviewId ?? null,
        p_details: r.details ?? null,
      }),
    auth: supabaseAuth(client, methods),
    mod: moderation(client),
  };
}
