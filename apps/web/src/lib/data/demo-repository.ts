/**
 * Browser-only implementation of the data contract, used when no Supabase
 * project is configured. It mirrors the server rules (duplicate detection,
 * no voting on your own spot, community removal thresholds, one review per
 * user and place, moderation) so the whole product can be tried locally and
 * tested end-to-end. Nothing leaves the browser.
 */
import { wgs84ToLv95 } from "@geolausanne/geo-types";
import seed from "./demo-seed.json";
import type { AuthAdapter, AuthUser, ModerationApi, Repository } from "./repository";
import {
  BackendError,
  type AppRole,
  type HalalLevel,
  type PlaceCategory,
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
import { DUPLICATE_RADIUS_M, REMOVAL_MAX_SCORE, REMOVAL_MIN_DOWNVOTES, SERVICE_AREA } from "./rules";

const STORAGE_KEY = "geolausanne-demo-v1";

type StoredPlace = Omit<Place, "is_mine" | "my_vote" | "creator_name" | "upvotes" | "downvotes" | "score" | "review_count" | "avg_rating" | "confirmations" | "last_confirmed_at"> & {
  created_by: string | null;
  moderation_lock: boolean;
};
interface StoredReview {
  id: string;
  place_id: string;
  user_id: string;
  rating: number | null;
  body: string;
  halal_confirmed: boolean;
  confirmation_method: Review["confirmation_method"];
  status: "visible" | "hidden";
  created_at: string;
  updated_at: string;
}
interface StoredReport {
  id: string;
  reason: ReportInput["reason"];
  place_id: string | null;
  review_id: string | null;
  details: string | null;
  reporter_id: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
}
interface DemoUser {
  id: string;
  email: string;
  display_name: string;
  role: AppRole;
  banned_until: string | null;
  created_at: string;
}
interface DemoState {
  places: StoredPlace[];
  votes: Record<string, Record<string, 1 | -1>>;
  reviews: StoredReview[];
  reports: StoredReport[];
  events: ModerationEvent[];
  users: DemoUser[];
  session: string | null;
}

const now = () => new Date().toISOString();
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trigram similarity, same idea as pg_trgm's similarity(). */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Set<string>();
    for (const w of normalize(s).split(" ").filter(Boolean)) {
      const p = `  ${w} `;
      for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** One row of demo-seed.json (written by `geovox seed-places --json`). */
interface SeedPlace {
  osm_id?: string;
  name: string;
  category: PlaceCategory;
  cuisine?: string[];
  lon: number;
  lat: number;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  halal_level?: HalalLevel;
}

function seedState(): DemoState {
  const places: StoredPlace[] = (seed.places as SeedPlace[]).map((p, i) => {
    const en = wgs84ToLv95(p.lon, p.lat);
    return {
      id: `osm-${p.osm_id ?? i}`,
      name: p.name,
      category: p.category,
      cuisine: p.cuisine ?? [],
      lon: p.lon,
      lat: p.lat,
      easting: en.e,
      northing: en.n,
      elevation: null,
      address: p.address ?? null,
      website: p.website ?? null,
      phone: p.phone ?? null,
      opening_hours: p.opening_hours ?? null,
      description: null,
      halal_level: p.halal_level ?? "unknown",
      certification: "community",
      certifier: null,
      certification_verified: false,
      serves_alcohol: null,
      status: "active",
      removed_at: null,
      source: "osm",
      created_at: "2026-10-19T00:00:00.000Z",
      created_by: null,
      moderation_lock: false,
    };
  });
  return { places, votes: {}, reviews: [], reports: [], events: [], users: [], session: null };
}

export class DemoRepository implements Repository {
  readonly mode = "demo" as const;
  private state: DemoState;
  private listeners = new Set<(u: AuthUser | null) => void>();

  constructor(private storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) {
    this.state = this.load();
  }

  private load(): DemoState {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as DemoState;
    } catch {
      // corrupted or unavailable storage: start fresh
    }
    return seedState();
  }

  private save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // quota or private mode: keep working in memory
    }
  }

  private user(): DemoUser | null {
    return this.state.users.find((u) => u.id === this.state.session) ?? null;
  }

  private requireUser(): DemoUser {
    const u = this.user();
    if (!u) throw new BackendError("not_authenticated");
    if (u.banned_until && u.banned_until > now()) throw new BackendError("account_suspended");
    return u;
  }

  private requireModerator(): DemoUser {
    const u = this.requireUser();
    if (u.role === "user") throw new BackendError("forbidden");
    return u;
  }

  private canSee(p: StoredPlace): boolean {
    const u = this.user();
    return p.status === "active" || (u !== null && (p.created_by === u.id || u.role !== "user"));
  }

  private result(p: StoredPlace): Place {
    const votes = this.state.votes[p.id] ?? {};
    const values = Object.values(votes);
    const upvotes = values.filter((v) => v === 1).length;
    const downvotes = values.filter((v) => v === -1).length;
    const visible = this.state.reviews.filter((r) => r.place_id === p.id && r.status === "visible");
    const rated = visible.filter((r) => r.rating !== null);
    const confirmed = visible.filter((r) => r.halal_confirmed);
    const me = this.user();
    const creator = this.state.users.find((u) => u.id === p.created_by);
    return {
      ...p,
      upvotes,
      downvotes,
      score: upvotes - downvotes,
      review_count: visible.length,
      avg_rating: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 100) / 100 : null,
      confirmations: confirmed.length,
      last_confirmed_at: confirmed.map((r) => r.updated_at).sort().at(-1) ?? null,
      creator_name: creator?.display_name ?? null,
      is_mine: me !== null && p.created_by === me.id,
      my_vote: me ? ((votes[me.id] as VoteValue | undefined) ?? null) : null,
    };
  }

  private log(action: string, placeId: string | null, note: string | null, actor: DemoUser | null) {
    const place = placeId ? this.state.places.find((p) => p.id === placeId) : undefined;
    this.state.events.unshift({
      id: Date.now() + Math.random(),
      action,
      note,
      created_at: now(),
      actor_name: actor?.display_name ?? null,
      place_id: placeId,
      place_name: place?.name ?? null,
    });
  }

  async placesInBounds(b: Bounds, limit = 400): Promise<Place[]> {
    return this.state.places
      .filter((p) => p.status === "active" && p.lon >= b.west && p.lon <= b.east && p.lat >= b.south && p.lat <= b.north)
      .map((p) => this.result(p))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async place(id: string): Promise<Place | null> {
    const p = this.state.places.find((x) => x.id === id);
    return p && this.canSee(p) ? this.result(p) : null;
  }

  async search(query: string): Promise<Place[]> {
    const q = normalize(query);
    if (q.length < 2) return [];
    return this.state.places
      .filter((p) => p.status === "active")
      .map((p) => ({ p, s: Math.max(similarity(p.name, q), normalize(`${p.name} ${p.cuisine.join(" ")} ${p.address ?? ""}`).includes(q) ? 0.5 : 0) }))
      .filter((x) => x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => this.result(x.p));
  }

  async nearby(lon: number, lat: number, radiusM: number): Promise<Place[]> {
    return this.state.places
      .filter((p) => p.status === "active" && distanceM(lon, lat, p.lon, p.lat) <= radiusM)
      .sort((a, b) => distanceM(lon, lat, a.lon, a.lat) - distanceM(lon, lat, b.lon, b.lat))
      .map((p) => this.result(p));
  }

  async createPlace(i: NewPlaceInput): Promise<Place> {
    const u = this.requireUser();
    const today = this.state.places.filter((p) => p.created_by === u.id && Date.now() - Date.parse(p.created_at) < 86_400_000);
    if (today.length >= 5) throw new BackendError("rate_limited");
    const name = i.name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2) throw new BackendError("invalid_name");
    if (i.lon < SERVICE_AREA.west || i.lon > SERVICE_AREA.east || i.lat < SERVICE_AREA.south || i.lat > SERVICE_AREA.north) {
      throw new BackendError("outside_service_area");
    }
    const dup = this.state.places.find(
      (p) => p.status !== "removed" && distanceM(i.lon, i.lat, p.lon, p.lat) <= DUPLICATE_RADIUS_M && similarity(p.name, name) > 0.45,
    );
    if (dup) throw new BackendError("duplicate_place", "duplicate_place", dup.id);
    const en = wgs84ToLv95(i.lon, i.lat);
    const place: StoredPlace = {
      id: uuid(),
      name,
      category: i.category,
      cuisine: [...new Set(i.cuisine.map((c) => c.trim().toLowerCase()).filter(Boolean))].slice(0, 6),
      lon: i.lon,
      lat: i.lat,
      easting: en.e,
      northing: en.n,
      elevation: i.elevation,
      address: i.address,
      website: i.website,
      phone: i.phone,
      opening_hours: i.opening_hours,
      description: i.description,
      halal_level: i.halal_level,
      certification: i.certification,
      certifier: i.certifier,
      certification_verified: false,
      serves_alcohol: i.serves_alcohol,
      status: "active",
      removed_at: null,
      source: "community",
      created_at: now(),
      created_by: u.id,
      moderation_lock: false,
    };
    this.state.places.push(place);
    this.save();
    return this.result(place);
  }

  async vote(placeId: string, value: VoteValue): Promise<Place> {
    const u = this.requireUser();
    const p = this.state.places.find((x) => x.id === placeId);
    if (!p || p.status !== "active") throw new BackendError("not_found");
    if (p.created_by === u.id) throw new BackendError("own_place");
    const votes = (this.state.votes[placeId] ??= {});
    if (value === 0) delete votes[u.id];
    else votes[u.id] = value;
    const r = this.result(p);
    if (!p.moderation_lock && r.downvotes >= REMOVAL_MIN_DOWNVOTES && r.score <= REMOVAL_MAX_SCORE) {
      p.status = "removed";
      p.removed_at = now();
      this.log("auto_remove", p.id, `score ${r.score} with ${r.downvotes} downvotes`, null);
    }
    this.save();
    return this.result(p);
  }

  async reviews(placeId: string): Promise<Review[]> {
    const me = this.user();
    return this.state.reviews
      .filter((r) => r.place_id === placeId && (r.status === "visible" || r.user_id === me?.id || (me && me.role !== "user")))
      .sort((a, b) => Number(b.user_id === me?.id) - Number(a.user_id === me?.id) || b.updated_at.localeCompare(a.updated_at))
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        halal_confirmed: r.halal_confirmed,
        confirmation_method: r.confirmation_method,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        author_name: this.state.users.find((u) => u.id === r.user_id)?.display_name ?? null,
        is_mine: r.user_id === me?.id,
      }));
  }

  async upsertReview(input: ReviewInput): Promise<void> {
    const u = this.requireUser();
    const p = this.state.places.find((x) => x.id === input.placeId);
    if (!p || p.status !== "active") throw new BackendError("not_found");
    if (input.halalConfirmed && !input.confirmationMethod) throw new BackendError("confirmation_method_required");
    const existing = this.state.reviews.find((r) => r.place_id === input.placeId && r.user_id === u.id);
    const fields = {
      rating: input.rating,
      body: input.body.trim().slice(0, 1000),
      halal_confirmed: input.halalConfirmed,
      confirmation_method: input.halalConfirmed ? input.confirmationMethod : null,
      updated_at: now(),
    };
    if (existing) Object.assign(existing, fields);
    else this.state.reviews.push({ id: uuid(), place_id: input.placeId, user_id: u.id, status: "visible", created_at: now(), ...fields });
    this.save();
  }

  async deleteMyReview(placeId: string): Promise<void> {
    const u = this.requireUser();
    this.state.reviews = this.state.reviews.filter((r) => !(r.place_id === placeId && r.user_id === u.id));
    this.save();
  }

  async report(input: ReportInput): Promise<void> {
    const u = this.requireUser();
    const existing = this.state.reports.find(
      (r) => r.reporter_id === u.id && r.status === "open" && r.place_id === (input.placeId ?? null) && r.review_id === (input.reviewId ?? null),
    );
    if (existing) {
      existing.reason = input.reason;
      existing.details = input.details ?? null;
    } else {
      this.state.reports.push({
        id: uuid(),
        reason: input.reason,
        place_id: input.placeId ?? null,
        review_id: input.reviewId ?? null,
        details: input.details ?? null,
        reporter_id: u.id,
        status: "open",
        created_at: now(),
      });
    }
    this.save();
  }

  auth: AuthAdapter = {
    providers: [],
    getUser: async () => {
      const u = this.user();
      return u ? { id: u.id, email: u.email } : null;
    },
    onChange: (cb) => {
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
    },
    signInWithEmail: async (email: string) => {
      const clean = email.trim().toLowerCase();
      let u = this.state.users.find((x) => x.email === clean);
      if (!u) {
        const id = uuid();
        u = {
          id,
          email: clean,
          // same pseudonymous default as the database (never the e-mail)
          display_name: `member-${id.replace(/-/g, "").slice(0, 6)}`,
          // demo convenience: addresses starting with "mod" can moderate
          role: clean.startsWith("mod") ? "moderator" : "user",
          banned_until: null,
          created_at: now(),
        };
        this.state.users.push(u);
      }
      this.state.session = u.id;
      this.save();
      const au = { id: u.id, email: u.email };
      this.listeners.forEach((l) => l(au));
      return { instant: true };
    },
    signInWithOAuth: async () => {
      throw new BackendError("forbidden", "OAuth is not available in demo mode");
    },
    signOut: async () => {
      this.state.session = null;
      this.save();
      this.listeners.forEach((l) => l(null));
    },
    profile: async (): Promise<Profile | null> => {
      const u = this.user();
      return u ? { id: u.id, display_name: u.display_name, role: u.role, banned_until: u.banned_until, created_at: u.created_at } : null;
    },
    updateDisplayName: async (name: string) => {
      const u = this.requireUser();
      const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
      if (!clean) throw new BackendError("invalid_name");
      u.display_name = clean;
      this.save();
    },
  };

  mod: ModerationApi = {
    reports: async (status = "open"): Promise<ModerationReport[]> => {
      this.requireModerator();
      return this.state.reports
        .filter((r) => r.status === status)
        .map((r) => {
          const review = r.review_id ? this.state.reviews.find((x) => x.id === r.review_id) : undefined;
          const placeId = r.place_id ?? review?.place_id ?? null;
          const place = placeId ? this.state.places.find((p) => p.id === placeId) : undefined;
          return {
            id: r.id,
            reason: r.reason,
            details: r.details,
            status: r.status,
            created_at: r.created_at,
            reporter_name: this.state.users.find((u) => u.id === r.reporter_id)?.display_name ?? null,
            place_id: placeId,
            place_name: place?.name ?? null,
            place_status: place?.status ?? null,
            review_id: r.review_id,
            review_body: review?.body ?? null,
            open_reports_for_target: this.state.reports.filter(
              (o) => o.status === "open" && o.place_id === r.place_id && o.review_id === r.review_id,
            ).length,
          };
        });
    },
    resolveReport: async (id, status, note) => {
      const m = this.requireModerator();
      const r = this.state.reports.find((x) => x.id === id);
      if (r) r.status = status;
      this.log(`report_${status}`, r?.place_id ?? null, note ?? null, m);
      this.save();
    },
    places: async (status: PlaceStatus) => {
      this.requireModerator();
      return this.state.places.filter((p) => p.status === status).map((p) => this.result(p));
    },
    setPlaceStatus: async (id, status, note) => {
      const m = this.requireModerator();
      const p = this.state.places.find((x) => x.id === id);
      if (!p) throw new BackendError("not_found");
      p.status = status;
      p.removed_at = status === "removed" ? now() : null;
      if (status === "active") p.moderation_lock = true;
      this.log(`place_${status}`, id, note ?? null, m);
      this.save();
      return this.result(p);
    },
    verifyCertification: async (id, verified, note) => {
      const m = this.requireModerator();
      const p = this.state.places.find((x) => x.id === id);
      if (!p) throw new BackendError("not_found");
      p.certification_verified = verified;
      if (verified) p.certification = "certified";
      this.log(verified ? "certification_verified" : "certification_unverified", id, note ?? null, m);
      this.save();
      return this.result(p);
    },
    deletePlace: async (id, note) => {
      const m = this.requireModerator();
      this.log("place_deleted", id, note ?? null, m);
      this.state.places = this.state.places.filter((p) => p.id !== id);
      this.save();
    },
    setReviewStatus: async (id, status, note) => {
      const m = this.requireModerator();
      const r = this.state.reviews.find((x) => x.id === id);
      if (r) r.status = status;
      this.log(`review_${status}`, r?.place_id ?? null, note ?? null, m);
      this.save();
    },
    events: async () => {
      this.requireModerator();
      return this.state.events.slice(0, 100);
    },
    banUser: async (userId, until, note) => {
      const m = this.requireModerator();
      const u = this.state.users.find((x) => x.id === userId);
      if (u) u.banned_until = until;
      this.log(until ? "user_banned" : "user_unbanned", null, note ?? null, m);
      this.save();
    },
    setRole: async (userId, role) => {
      const m = this.requireUser();
      if (m.role !== "admin") throw new BackendError("forbidden");
      const u = this.state.users.find((x) => x.id === userId);
      if (u) u.role = role;
      this.save();
    },
  };

  /** Test helper: wipe everything back to the seed. */
  reset() {
    this.state = seedState();
    this.save();
  }
}
