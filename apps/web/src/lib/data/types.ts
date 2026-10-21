/** Domain types, mirroring supabase/migrations (place_result & friends). */

export const PLACE_CATEGORIES = ["restaurant", "fast_food", "cafe", "bakery", "butcher", "grocery", "food_truck", "other"] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const HALAL_LEVELS = ["full", "partial", "unknown"] as const;
export type HalalLevel = (typeof HALAL_LEVELS)[number];

export const CERTIFICATIONS = ["certified", "self_declared", "community"] as const;
export type Certification = (typeof CERTIFICATIONS)[number];

export type PlaceStatus = "active" | "hidden" | "removed";
export type VoteValue = -1 | 0 | 1;

export const CONFIRMATION_METHODS = ["certificate", "asked_staff", "owner", "other"] as const;
export type ConfirmationMethod = (typeof CONFIRMATION_METHODS)[number];

export const REPORT_REASONS = ["not_halal", "closed", "wrong_location", "duplicate", "spam", "offensive", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type AppRole = "user" | "moderator" | "admin";

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  cuisine: string[];
  lon: number;
  lat: number;
  easting: number;
  northing: number;
  elevation: number | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  description: string | null;
  halal_level: HalalLevel;
  certification: Certification;
  certifier: string | null;
  certification_verified: boolean;
  serves_alcohol: boolean | null;
  upvotes: number;
  downvotes: number;
  score: number;
  confirmations: number;
  last_confirmed_at: string | null;
  review_count: number;
  avg_rating: number | null;
  status: PlaceStatus;
  removed_at: string | null;
  source: "community" | "osm" | "import";
  created_at: string;
  creator_name: string | null;
  is_mine: boolean;
  my_vote: VoteValue | null;
}

export interface Review {
  id: string;
  rating: number | null;
  body: string;
  halal_confirmed: boolean;
  confirmation_method: ConfirmationMethod | null;
  status: "visible" | "hidden";
  created_at: string;
  updated_at: string;
  author_name: string | null;
  is_mine: boolean;
}

export interface Profile {
  id: string;
  display_name: string;
  role: AppRole;
  banned_until: string | null;
  created_at: string;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface NewPlaceInput {
  name: string;
  lon: number;
  lat: number;
  category: PlaceCategory;
  cuisine: string[];
  elevation: number | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  description: string | null;
  halal_level: HalalLevel;
  certification: Certification;
  certifier: string | null;
  serves_alcohol: boolean | null;
}

export interface ReviewInput {
  placeId: string;
  rating: number | null;
  body: string;
  halalConfirmed: boolean;
  confirmationMethod: ConfirmationMethod | null;
}

export interface ReportInput {
  reason: ReportReason;
  placeId?: string;
  reviewId?: string;
  details?: string;
}

export interface ModerationReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reporter_name: string | null;
  place_id: string | null;
  place_name: string | null;
  place_status: PlaceStatus | null;
  review_id: string | null;
  /** the review's text, or the copy kept with the report once the review is deleted */
  review_body: string | null;
  is_review: boolean;
  review_deleted: boolean;
  author_name: string | null;
  author_banned_until: string | null;
  /** the author's suspension is in force now */
  author_suspended: boolean;
  /** an author exists and the caller may suspend them (moderators: members only) */
  can_suspend_author: boolean;
  open_reports_for_target: number;
}

export interface ModerationEvent {
  id: number;
  action: string;
  note: string | null;
  created_at: string;
  actor_name: string | null;
  place_id: string | null;
  place_name: string | null;
}

/** Error codes raised by the backend (see the SQL functions). */
export type BackendErrorCode =
  | "not_authenticated"
  | "account_suspended"
  | "account_too_new"
  | "rate_limited"
  | "duplicate_place"
  | "recently_removed"
  | "outside_service_area"
  | "invalid_name"
  | "own_place"
  | "not_found"
  | "forbidden"
  | "confirmation_method_required"
  | "network"
  | "unknown";

export class BackendError extends Error {
  constructor(
    public code: BackendErrorCode,
    message?: string,
    public detail?: string,
  ) {
    super(message ?? code);
    this.name = "BackendError";
  }
}
