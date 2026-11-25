"use client";

import type { RoomGame, RpsPick } from "@tribunal/bot/room/chaos";
import type { ClientMessage } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PerspectiveCamera } from "three";

const PICKS: RpsPick[] = ["rock", "paper", "scissors"];
const HOVER_GAP_MS = 100;

/** First-person camera and inputs; the ordinary player controller stays idle during a game. */
export const GameController = ({ game, self, send, onHover }: {
  game: RoomGame;
  self: PlayerState;
  send: (message: ClientMessage) => void;
  onHover: (column: number) => void;
}) => {
  const { camera, gl } = useThree();
  const currentRef = useRef(game);
  currentRef.current = game;
  const pointerRef = useRef(0.5);
  const columnRef = useRef(3);
  const sentAtRef = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;
    columnRef.current = 3;
    pointerRef.current = 0.5;
    sentAtRef.current = 0;
    onHover(3);
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = (event.clientX - rect.left) / Math.max(rect.width, 1);
      pointerRef.current = Math.max(0, Math.min(0.999, pointerRef.current));
      const screenColumn = Math.floor(pointerRef.current * 7);
      const column = currentRef.current.players[0] === self.id ? 6 - screenColumn : screenColumn;
      if (column === columnRef.current) return;
      columnRef.current = column;
      onHover(column);
    };
    const press = (event: MouseEvent) => {
      const current = currentRef.current;
      if (event.button !== 0 || current.kind !== "connect4" || current.turn !== self.id || current.winner !== null || current.draw) return;
      event.preventDefault();
      send({ type: "connect4-drop", column: columnRef.current });
    };
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Escape") {
        event.preventDefault();
        send({ type: "quit-game" });
      }
      if (currentRef.current.kind !== "rps") return;
      const pick = PICKS[Number(event.code.replace("Digit", "")) - 1];
      if (pick === undefined) return;
      event.preventDefault();
      send({ type: "rps-pick", pick });
    };
    const noMenu = (event: Event) => event.preventDefault();
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("mousedown", press);
    canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", down);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("mousedown", press);
      canvas.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", down);
      if (camera instanceof PerspectiveCamera) {
        camera.fov = 60;
        camera.updateProjectionMatrix();
      }
    };
  }, [game.id, self.id, camera, gl, send, onHover]);

  useFrame(() => {
    camera.position.set(self.position.x, 1.8, self.position.z);
    camera.lookAt(game.position.x, game.kind === "connect4" ? 1.4 : 1.24, game.position.z);
    if (camera instanceof PerspectiveCamera && camera.fov !== 65) {
      camera.fov = 65;
      camera.updateProjectionMatrix();
    }
    const now = performance.now();
    // Retry until the snapshot confirms the column: network jitter can make the server throttle a just-sent hover.
    if (game.kind === "connect4" && game.winner === null && !game.draw && game.hovered[self.id] !== columnRef.current && now - sentAtRef.current >= HOVER_GAP_MS) {
      sentAtRef.current = now;
      send({ type: "game-hover", column: columnRef.current });
    }
  });
  return null;
};
