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
