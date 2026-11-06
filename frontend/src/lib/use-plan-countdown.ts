"use client";

import { useEffect, useRef, useState } from "react";

export type CountdownSnapshot = { milliseconds: number; sampledAt: number; running: boolean };

export function millisecondsLeft(snapshot: CountdownSnapshot, now: number): number {
  const elapsed = snapshot.running ? Math.max(0, now - snapshot.sampledAt) : 0;
  return Math.max(0, snapshot.milliseconds - elapsed);
}

/** Display interpolation only. Server heartbeat remains authoritative for billing/access. */
export function usePlanCountdown(
  plan: { remaining_seconds: number; tier: string } | null,
  enabled: boolean,
): number {
  const [seconds, setSeconds] = useState(plan?.remaining_seconds ?? 0);
  const snapshot = useRef<CountdownSnapshot>({ milliseconds: 0, sampledAt: 0, running: false });

  useEffect(() => {
    const isActive = () => enabled && plan?.tier === "normal" && document.visibilityState === "visible" && document.hasFocus();
    const now = performance.now();
    // Re-anchor on each confirmed status, including day reset or a plan change.
    snapshot.current = { milliseconds: Math.max(0, plan?.remaining_seconds ?? 0) * 1000, sampledAt: now, running: isActive() };
    const paint = () => setSeconds(Math.ceil(millisecondsLeft(snapshot.current, performance.now()) / 1000));
    const changeActivity = () => {
      const timestamp = performance.now();
      snapshot.current = { milliseconds: millisecondsLeft(snapshot.current, timestamp), sampledAt: timestamp, running: isActive() };
      paint();
    };
    paint();
    if (!plan || !enabled || plan.tier !== "normal") return;
    const timer = window.setInterval(paint, 250);
    document.addEventListener("visibilitychange", changeActivity);
    window.addEventListener("focus", changeActivity);
    window.addEventListener("blur", changeActivity);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", changeActivity);
      window.removeEventListener("focus", changeActivity);
      window.removeEventListener("blur", changeActivity);
    };
  }, [plan, enabled]);

  return seconds;
}
