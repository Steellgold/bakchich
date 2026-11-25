"use client";

// Purple lightning: jagged bolts re-rolled every few frames, for the ceiling portal and the tunnel of the jumper.
import type { ComponentRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending } from "three";

const REROLL_SECONDS = 0.07;
const SEGMENTS = 9;
type Point = [number, number, number];
/** Placeholder until the first re-roll */
const IDLE: Point[] = [[0, 0, 0], [0, 0.01, 0]];

/** `ends` gives the two ends of a bolt (in the space of the parent group) each time it is re-rolled; `jitter` is how far the bolt strays from the straight line, in meters */
export const Bolts = ({ count, ends, jitter, width = 3, color = "#c9a2ff" }: {
  count: number;
  ends: (index: number) => [Point, Point];
  jitter: number;
  width?: number;
  color?: string;
}) => {
  const lineRef = useRef<(ComponentRef<typeof Line> | null)[]>([]);
  const elapsedRef = useRef(REROLL_SECONDS);

  useFrame((_state, delta) => {
    elapsedRef.current += delta;

    if (elapsedRef.current < REROLL_SECONDS) return;

    elapsedRef.current = 0;

    for (const [index, line] of lineRef.current.entries()) {
      if (line === null) continue;

      const [from, to] = ends(index);
      const flat: number[] = [];

      for (let step = 0; step <= SEGMENTS; step += 1) {
        const t = step / SEGMENTS;
        // The ends stay put, the points between stray:
        const stray = step === 0 || step === SEGMENTS ? 0 : jitter;
        flat.push(
          from[0] + (to[0] - from[0]) * t + (Math.random() - 0.5) * 2 * stray,
          from[1] + (to[1] - from[1]) * t + (Math.random() - 0.5) * 2 * stray,
          from[2] + (to[2] - from[2]) * t + (Math.random() - 0.5) * 2 * stray,
        );
      }

      line.geometry.setPositions(flat);
    }
  });

  return Array.from({ length: count }, (_, index) => (
    <Line
      key={index}
      ref={(line) => {
        lineRef.current[index] = line;
      }}
      points={IDLE}
      color={color}
      lineWidth={width}
      transparent
      depthWrite={false}
      blending={AdditiveBlending}
      frustumCulled={false}
    />
  ));
};
