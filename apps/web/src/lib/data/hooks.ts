"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { lv95ToWgs84 } from "@geolausanne/geo-types";
import { getRepository } from "./index";
import type { Bounds, NewPlaceInput, Place, ReportInput, ReviewInput, VoteValue } from "./types";

export const queryKeys = {
  places: (b: Bounds) => ["places", b.west, b.south, b.east, b.north] as const,
  place: (id: string) => ["place", id] as const,
  reviews: (id: string) => ["reviews", id] as const,
  search: (q: string) => ["search", q] as const,
  nearby: (lon: number, lat: number) => ["nearby", lon.toFixed(5), lat.toFixed(5)] as const,
};

/**
 * Query box around the camera target. The half-size steps through powers of
 * two with the camera distance and the edges snap to a 250 m grid, so small
 * pans and zooms reuse the cached query.
 */
export function boundsAround(e: number, n: number, distance: number): Bounds {
  const half = Math.min(600 * 2 ** Math.max(0, Math.ceil(Math.log2((distance * 1.4) / 600))), 7000);
  const snap = (v: number) => Math.round(v / 250) * 250;
  const sw = lv95ToWgs84(snap(e - half), snap(n - half));
  const ne = lv95ToWgs84(snap(e + half), snap(n + half));
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return { west: r(sw.lon), south: r(sw.lat), east: r(ne.lon), north: r(ne.lat) };
}

export function usePlacesInBounds(bounds: Bounds | null) {
  return useQuery({
    queryKey: bounds ? queryKeys.places(bounds) : ["places", "none"],
    queryFn: () => getRepository().placesInBounds(bounds!),
    enabled: bounds !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function usePlace(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: id ? queryKeys.place(id) : ["place", "none"],
    queryFn: () => getRepository().place(id!),
    enabled: id !== null,
    // the map query already has most fields: show them instantly
    initialData: () => (id ? findCachedPlace(qc, id) : undefined),
    initialDataUpdatedAt: 0,
  });
}

export function useReviews(placeId: string | null) {
  return useQuery({
    queryKey: placeId ? queryKeys.reviews(placeId) : ["reviews", "none"],
    queryFn: () => getRepository().reviews(placeId!),
    enabled: placeId !== null,
  });
}

export function useSearchPlaces(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => getRepository().search(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useNearby(point: { lon: number; lat: number } | null, radiusM = 60) {
  return useQuery({
    queryKey: point ? queryKeys.nearby(point.lon, point.lat) : ["nearby", "none"],
    queryFn: () => getRepository().nearby(point!.lon, point!.lat, radiusM),
    enabled: point !== null,
  });
}

function findCachedPlace(qc: QueryClient, id: string): Place | undefined {
  for (const [, data] of qc.getQueriesData<Place[]>({ queryKey: ["places"] })) {
    const hit = data?.find((p) => p.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Write a fresh copy of a place into every cache that holds it. */
export function updatePlaceCaches(qc: QueryClient, place: Place) {
  qc.setQueryData(queryKeys.place(place.id), place);
  qc.setQueriesData<Place[]>({ queryKey: ["places"] }, (list) => {
    if (!list) return list;
    if (place.status !== "active") return list.filter((p) => p.id !== place.id);
    return list.map((p) => (p.id === place.id ? place : p));
  });
}

function optimisticVote(place: Place, value: VoteValue): Place {
  const prev = place.my_vote ?? 0;
  const up = place.upvotes - (prev === 1 ? 1 : 0) + (value === 1 ? 1 : 0);
  const down = place.downvotes - (prev === -1 ? 1 : 0) + (value === -1 ? 1 : 0);
  return { ...place, upvotes: up, downvotes: down, score: up - down, my_vote: value === 0 ? null : value };
}

export function useVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ place, value }: { place: Place; value: VoteValue }) => getRepository().vote(place.id, value),
    onMutate: async ({ place, value }) => {
      await qc.cancelQueries({ queryKey: queryKeys.place(place.id) });
      const before = qc.getQueryData<Place>(queryKeys.place(place.id)) ?? place;
      updatePlaceCaches(qc, optimisticVote(before, value));
      return { before };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.before) updatePlaceCaches(qc, ctx.before);
    },
    onSuccess: (fresh) => {
      updatePlaceCaches(qc, fresh);
      if (fresh.status !== "active") void qc.invalidateQueries({ queryKey: ["places"] });
    },
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewPlaceInput) => getRepository().createPlace(input),
    onSuccess: (place) => {
      qc.setQueryData(queryKeys.place(place.id), place);
      void qc.invalidateQueries({ queryKey: ["places"] });
      void qc.invalidateQueries({ queryKey: ["nearby"] });
    },
  });
}

export function useUpsertReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => getRepository().upsertReview(input),
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: queryKeys.reviews(input.placeId) });
      void qc.invalidateQueries({ queryKey: queryKeys.place(input.placeId) });
    },
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => getRepository().deleteMyReview(placeId),
    onSuccess: (_d, placeId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.reviews(placeId) });
      void qc.invalidateQueries({ queryKey: queryKeys.place(placeId) });
    },
  });
}

export function useReport() {
  return useMutation({ mutationFn: (input: ReportInput) => getRepository().report(input) });
}
