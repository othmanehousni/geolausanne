/**
 * Community rules shared by the UI and the demo backend. The production
 * values live in private.settings (supabase/migrations/…_schema.sql); keep
 * both in sync.
 */
export const REMOVAL_MIN_DOWNVOTES = 5;
export const REMOVAL_MAX_SCORE = -5;
export const REMOVAL_GRACE_DAYS = 14;
export const DUPLICATE_RADIUS_M = 40;
export const SERVICE_AREA = { west: 6.45, south: 46.44, east: 6.85, north: 46.65 } as const;

/** Per-member limits per 24 h (private.settings limit_*_per_day). */
export const DAILY_LIMITS = { places: 5, reviews: 20, reports: 20 } as const;

/**
 * Longest values the database keeps (clean_text lengths and check constraints
 * in the migrations); forms use them as maxLength so nothing is cut silently.
 */
export const FIELD_LIMITS = {
  name: 80,
  cuisineTags: 6,
  cuisineTag: 30,
  address: 160,
  website: 300,
  phone: 40,
  openingHours: 200,
  description: 600,
  certifier: 80,
  reviewBody: 1000,
  reportDetails: 500,
} as const;
