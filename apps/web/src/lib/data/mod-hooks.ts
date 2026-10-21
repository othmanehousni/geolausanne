"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRepository } from "./index";
import type { PlaceStatus } from "./types";

export const modKeys = {
  reports: ["mod", "reports"] as const,
  places: (status: PlaceStatus) => ["mod", "places", status] as const,
  events: ["mod", "events"] as const,
};

export function useModReports(enabled: boolean) {
  return useQuery({ queryKey: modKeys.reports, queryFn: () => getRepository().mod.reports("open"), enabled });
}

export function useModPlaces(status: PlaceStatus, enabled: boolean) {
  return useQuery({ queryKey: modKeys.places(status), queryFn: () => getRepository().mod.places(status), enabled });
}

export function useModEvents(enabled: boolean) {
  return useQuery({ queryKey: modKeys.events, queryFn: () => getRepository().mod.events(), enabled });
}

/** Runs one moderation call, then refreshes every list and map query it can affect. */
export function useModAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["mod"] });
      void qc.invalidateQueries({ queryKey: ["places"] });
      void qc.invalidateQueries({ queryKey: ["place"] });
      void qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}
