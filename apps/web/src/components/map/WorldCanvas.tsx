"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useSyncExternalStore } from "react";
import { useWorldStore } from "@/stores/world-store";

// three.js, R3F and the tile workers only load in the browser, after the
// overlay UI is interactive.
const VoxelWorld = dynamic(() => import("@/components/world/VoxelWorld"), { ssr: false, loading: () => null });

let webgl: boolean | null = null;
/** three.js renders with WebGL 2 only: a WebGL 1 browser gets the "no 3D" notice, not a crash. */
function hasWebGL(): boolean {
  if (webgl === null) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      webgl = gl !== null;
      // only a probe: give the context back (browsers cap live contexts)
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noSubscribe = () => () => {};

class CanvasBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("3D view crashed", error);
    useWorldStore.getState().setRenderError("crashed");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Mounts the 3D city when the browser can render it; errors surface in <MapStatus />. */
export function WorldCanvas() {
  const setRenderError = useWorldStore((s) => s.setRenderError);
  // null while rendering on the server
  const supported = useSyncExternalStore(noSubscribe, hasWebGL, () => null);

  useEffect(() => {
    if (supported === false) setRenderError("no-webgl");
  }, [supported, setRenderError]);

  if (!supported) return null;
  return (
    <CanvasBoundary>
      <VoxelWorld />
    </CanvasBoundary>
  );
}
