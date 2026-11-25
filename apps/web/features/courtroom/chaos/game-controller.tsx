"use client";

import type { RoomGame, RpsPick } from "@tribunal/bot/room/chaos";
import type { ClientMessage } from "@tribunal/bot/room/protocol";
import type { PlayerState } from "@tribunal/bot/room/world";
import { CELL_PITCH } from "./game-geometry";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";

const PICKS: RpsPick[] = ["rock", "paper", "scissors"];
const HOVER_GAP_MS = 100;
const ray = new Raycaster();
const plane = new Plane();
const ndc = new Vector2();
const normal = new Vector3();
const center = new Vector3();
const hit = new Vector3();

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
  const columnRef = useRef(3);
  const sentAtRef = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;
    columnRef.current = 3;
    sentAtRef.current = 0;
    onHover(3);
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, 1 - ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2);
      // The column is where the pointer ray meets the board face, not a share of the screen width (the board only fills part of the view).
      const { position, rotation } = currentRef.current;
      const sin = Math.sin(rotation);
      const cos = Math.cos(rotation);
      ray.setFromCamera(ndc, camera);
      plane.setFromNormalAndCoplanarPoint(normal.set(sin, 0, cos), center.set(position.x, 0, position.z));
      if (ray.ray.intersectPlane(plane, hit) === null) return;
      const boardX = (hit.x - position.x) * cos - (hit.z - position.z) * sin;
      const column = Math.max(0, Math.min(6, Math.round(boardX / CELL_PITCH + 3)));
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
