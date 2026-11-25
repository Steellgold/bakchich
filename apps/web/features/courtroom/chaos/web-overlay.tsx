"use client";

// The victim's screen when a web hits them: white-grey spider web lines over the 3D view, fading out in WEB_SCREEN_MS.
import type { TomatoFlight } from "@/features/courtroom/use-room-socket";
import { useEffect, useState } from "react";

/** Hub of the web in the 100 x 100 view box, and its radial threads (angle in degrees) */
const HUB = 52;
const THREADS = [0, 40, 85, 130, 175, 220, 265, 310];
const RINGS = [12, 26, 42, 62];

const point = (angle: number, radius: number) => `${(HUB + Math.cos((angle * Math.PI) / 180) * radius).toFixed(1)},${(HUB + Math.sin((angle * Math.PI) / 180) * radius).toFixed(1)}`;

export const WebOverlay = ({ flights, selfId }: { flights: TomatoFlight[]; selfId: string | null }) => {
  // Counts the hits: a new key restarts the CSS fade
  const [hits, setHits] = useState(0);

  useEffect(() => {
    // The web lands on the screen when it lands on the player (flights already landed are skipped):
    const timers = new Set<ReturnType<typeof setTimeout>>();

    for (const flight of flights) {
      const left = flight.at + flight.duration * 1_000 - Date.now();
      if (flight.kind !== "web" || flight.impact?.kind !== "player" || flight.impact.id !== selfId || left <= 0) continue;

      const timer = setTimeout(() => {
        setHits((count) => count + 1);
      }, left);
      timers.add(timer);
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [flights, selfId]);

  if (hits === 0) return null;

  return (
    <svg key={hits} className="web-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {THREADS.map((angle) => (
        <line key={angle} x1={HUB} y1={HUB} x2={point(angle, 120).split(",")[0]} y2={point(angle, 120).split(",")[1]} />
      ))}
      {RINGS.map((radius) => (
        <polygon key={radius} points={THREADS.map((angle) => point(angle, radius * (0.9 + ((angle * 7) % 5) / 25))).join(" ")} />
      ))}
    </svg>
  );
};
