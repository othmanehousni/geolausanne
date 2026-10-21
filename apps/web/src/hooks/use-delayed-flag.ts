"use client";

import { useEffect, useState } from "react";

/** True once `flag` has stayed true for `ms`: avoids flashing indicators for quick work. */
export function useDelayedFlag(flag: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const id = setTimeout(() => setLate(true), ms);
    return () => {
      clearTimeout(id);
      setLate(false);
    };
  }, [flag, ms]);
  return flag && late;
}
