/**
 * Data access contract used by every UI component. Two implementations:
 *  - SupabaseRepository (production): RPCs with RLS, see supabase/migrations
 *  - DemoRepository: same rules, stored in this browser; used when no
 *    Supabase project is configured (local development, previews, e2e tests)
 */
import type {
  AppRole,
  Bounds,
  ModerationEvent,
  ModerationReport,
  NewPlaceInput,
  Place,
  PlaceStatus,
  Profile,
  ReportInput,
  Review,
  ReviewInput,
  VoteValue,
} from "./types";

export interface AuthUser {
  id: string;
  email: string | null;
}

export type OAuthProvider = "google" | "github";

export interface AuthAdapter {
  getUser(): Promise<AuthUser | null>;
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signInWithEmail(email: string, redirectTo: string, captchaToken?: string): Promise<{ instant: boolean }>;
  signInWithOAuth(provider: OAuthProvider, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  profile(): Promise<Profile | null>;
  updateDisplayName(name: string): Promise<void>;
  /** OAuth providers enabled for this deployment */
  providers: OAuthProvider[];
  /** Whether sign-in links are sent by e-mail (in production, Supabase needs an SMTP server for that) */
  emailSignIn: boolean;
}

/** The sign-in methods a deployment offers (see `signInMethods`). */
export type SignInMethods = Pick<AuthAdapter, "emailSignIn" | "providers">;

export interface ModerationApi {
  reports(status?: "open" | "resolved" | "dismissed"): Promise<ModerationReport[]>;
  resolveReport(id: string, status: "resolved" | "dismissed", note?: string): Promise<void>;
  places(status: PlaceStatus): Promise<Place[]>;
  setPlaceStatus(id: string, status: PlaceStatus, note?: string): Promise<Place>;
  verifyCertification(id: string, verified: boolean, note?: string): Promise<Place>;
  deletePlace(id: string, note?: string): Promise<void>;
  setReviewStatus(id: string, status: "visible" | "hidden", note?: string): Promise<void>;
  events(): Promise<ModerationEvent[]>;
  banUser(userId: string, until: string | null, note?: string): Promise<void>;
  /** Suspends the author of a report's spot or review for `days` (0 lifts it); returns the end date. */
  suspendAuthor(reportId: string, days: number, note?: string): Promise<string | null>;
  setRole(userId: string, role: AppRole): Promise<void>;
}

export interface Repository {
  readonly mode: "supabase" | "demo";
  placesInBounds(bounds: Bounds, limit?: number): Promise<Place[]>;
  place(id: string): Promise<Place | null>;
  search(query: string): Promise<Place[]>;
  nearby(lon: number, lat: number, radiusM: number): Promise<Place[]>;
  createPlace(input: NewPlaceInput): Promise<Place>;
  vote(placeId: string, value: VoteValue): Promise<Place>;
  reviews(placeId: string): Promise<Review[]>;
  upsertReview(input: ReviewInput): Promise<void>;
  deleteMyReview(placeId: string): Promise<void>;
  report(input: ReportInput): Promise<void>;
  auth: AuthAdapter;
  mod: ModerationApi;
}
