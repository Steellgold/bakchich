import type { Rig } from "./motion";
import type { RoomGame } from "@tribunal/bot/room/chaos";
import { connect4HandTarget, restPosition, rpsHandTarget } from "../chaos/game-geometry";
import { Quaternion, Vector3 } from "three";

const down = new Vector3(0, -1, 0);
const target = new Vector3();
const direction = new Vector3();
const rotation = new Quaternion();

/** Procedural reaching layer over idle, so opponents and spectators see the selected column. */
export const animateGame = (rig: Rig, game: RoomGame, id: string, time: number, delta: number) => {
  const side = game.players[0] === id ? -1 : 1;
  const column = game.hovered[id] ?? 3;
  const active = game.kind === "connect4" && game.turn === id && game.winner === null && !game.draw;
  const arm = rig.arms[0];
  const elbow = rig.elbows[0];
  if (arm !== null && arm.parent !== null) {
    const previous = arm.userData.gameId === game.id ? arm.userData.gameReach as Vector3 : restPosition(side, new Vector3());
    arm.userData.gameId = game.id;
    arm.userData.gameReach = previous;
    if (game.kind === "rps") previous.copy(rpsHandTarget(side, game.revealedAt, target).target);
    else previous.lerp(connect4HandTarget(side, column, active, target), 1 - Math.exp(-delta * 18));
    target.set(
      game.position.x + Math.cos(game.rotation) * previous.x + Math.sin(game.rotation) * previous.z,
      previous.y,
      game.position.z - Math.sin(game.rotation) * previous.x + Math.cos(game.rotation) * previous.z,
    );
    arm.parent.updateWorldMatrix(true, false);
    arm.parent.worldToLocal(target);
    direction.copy(target).sub(arm.position);
    // The articulated game hand supplies the forearm. Stretch the cartoon sleeve to join its elbow without a floating second hand.
    arm.scale.y = direction.length() / (4 / 16);
    arm.quaternion.copy(rotation.setFromUnitVectors(down, direction.normalize()));
    if (elbow !== null) elbow.visible = false;
  }
  // The other arm rests on the table, with just the idle breathing movement.
  if (rig.arms[1] !== null) rig.arms[1].rotation.x = 0.4 + Math.sin(time * 2) * 0.015;
  if (rig.elbows[1] !== null) rig.elbows[1].rotation.x = 0.8;
};
