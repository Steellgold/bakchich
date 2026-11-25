import type { Trial } from "#/features/court/engine";
import type { RoomMember } from "#/features/room/access";
import type { ClientMessage, ServerMessage } from "#/features/room/protocol";
import type { World } from "#/features/room/world";
import type { WebSocket } from "ws";
import { recordIncident } from "#/features/clerk/clerk";
import { court, judge } from "#/features/court/court";
import { judgeSays } from "#/features/hearings/hearings";
import { Chaos, CHAOS_REACH } from "#/features/room/chaos";
import { findGamePlacement, gamePlayerPositions } from "#/features/room/game-placement";
import { simulateTomato, tomatoSpeed } from "#/features/room/tomato";
import { EMOJI } from "#/utils/emojis";
import { trigger } from "#/utils/trigger";

// The judge reacts out loud to the chaos with canned lines (no AI), at most once in a while:
const JUDGE_REBUKE_GAP_MS = 30_000;
const RUMOR_GAP_MS = 15_000;
/** The tomato must leave from near the thrower (shoulder of the aiming camera, plus network lag) */
const TOMATO_ORIGIN_REACH = 2;

const OBJECTION_REBUKES = [
  "Le public n'a pas le droit d'objecter. Le public a le droit de se taire.",
  "Objection du public rejetée. Et notée. Et jugée.",
  "Encore une objection depuis les bancs et je fais évacuer la salle.",
] as const;

const FIGHT_REBUKES = [`Trouble à l'audience ! Gardes, sortez-moi ces deux énergumènes. ${EMOJI.policeArrest}`, `On se bat dans mon tribunal ? Ce sera noté au casier. ${EMOJI.policeWarning}`] as const;

/** Discord-facing effects and message handling around the Discord-free chaos rules. */
export const createRoomChaos = ({ world, send, sendTo, broadcast, displayedTrial }: {
  world: World;
  send: (socket: WebSocket, message: ServerMessage) => void;
  sendTo: (id: string, message: ServerMessage) => void;
  broadcast: (message: ServerMessage) => void;
  displayedTrial: () => Trial | null;
}) => {
  const chaos = new Chaos();
  let lastRebukeAt = 0;
  let lastRumorAt = 0;

  /** The judge rebukes the room out loud, only during a trial and not too often */
  const rebuke = (lines: readonly string[]) => {
    const line = chaos.pick(lines);
    const displayed = displayedTrial();

    if (displayed === null || line === undefined || Date.now() - lastRebukeAt < JUDGE_REBUKE_GAP_MS) return;

    lastRebukeAt = Date.now();
    court.say(displayed.channelId, null, line);
    judgeSays(displayed.channelId, line);
  };

  /** Chaos is for the audience standing or on the benches: not for the parties, nor for the jurors in their box */
  const canMakeChaos = (id: string) => {
    const state = world.player(id);
    return state?.role === null && state.seatId?.startsWith("jury-") !== true && state.air === null;
  };

  /** Another connected member close enough */
  const targetNear = (id: string, targetId: string, reach: number) => {
    const self = world.player(id);
    const target = world.player(targetId);

    if (self === undefined || target?.air !== null || targetId === id) return undefined;

    return Math.hypot(self.position.x - target.position.x, self.position.z - target.position.z) <= reach ? target : undefined;
  };

  const nameOf = (id: string) => world.player(id)?.name ?? "Quelqu'un";

  const sendGames = (ids: string[]) => {
    for (const id of ids) sendTo(id, {
      type: "game",
      game: chaos.gameView(id, nameOf),
    });
  };

  const whisperRumor = trigger.safeListener("Courtroom rumor", async (fromId: string, targetId: string) => {
    // The rumor is about someone else in the room when there is anyone, else about the one who hears it:
    const others = world.players().filter((player) => player.id !== fromId && player.id !== targetId);

    const subject = chaos.pick(others)?.name ?? nameOf(targetId);
    const text = await judge.rumor(subject);
    sendTo(targetId, {
      type: "rumor",
      fromName: nameOf(fromId),
      text,
    });
    sendTo(fromId, {
      type: "rumor",
      fromName: "Tu chuchotes",
      text,
    });
  });

  const recordTrouble = trigger.safeListener("Courtroom incident", async (id: string) => {
    await recordIncident({
      id,
      name: nameOf(id),
    });
  });

  /** A free-aimed tomato: the server flies it and tells everybody where it lands */
  const throwTomato = (id: string, message: Extract<ClientMessage, { type: "throw-tomato" }>, now: number) => {
    const thrower = world.player(id);
    const { origin, direction } = message;
    const length = Math.hypot(direction.x, direction.y, direction.z);

    if (thrower === undefined || length === 0 || origin.y < 0.3 || origin.y > 4 || Math.hypot(origin.x - thrower.position.x, origin.z - thrower.position.z) > TOMATO_ORIGIN_REACH) return;

    if (!chaos.ready(id, "tomato", now)) {
      sendTo(id, {
        type: "chaos-refused",
        reason: "Ta dernière tomate n'a pas fini de sécher, patiente.",
      });
      return;
    }

    const speed = tomatoSpeed(message.power);
    const velocity = {
      x: (direction.x / length) * speed,
      y: (direction.y / length) * speed,
      z: (direction.z / length) * speed,
    };
    const { duration, impact } = simulateTomato(origin, velocity, world.players().filter((player) => player.id !== id && player.air === null));
    broadcast({
      type: "effect",
      kind: "tomato",
      fromId: id,
      origin,
      velocity,
      duration,
      impact,
    });

    // The face is only splattered once the tomato lands:
    if (impact?.kind === "player") setTimeout(() => chaos.splat(impact.id, Date.now()), duration * 1_000);
  };

  const quitGame = (id: string) => {
    const ids = chaos.quitGame(id);
    world.releaseGame(ids);
    for (const player of ids) sendTo(player, { type: "game", game: null });
  };

  /** Chaos messages from a member of the audience, every rule checked here */
  const handleChaos = (member: RoomMember, socket: WebSocket, message: ClientMessage) => {
    const now = Date.now();
    const refuse = (reason: string) => send(socket, {
      type: "chaos-refused",
      reason,
    });

    if (message.type === "answer-challenge") {
      const challenge = chaos.pendingChallenge(member.id);
      const from = challenge === undefined ? undefined : world.player(challenge.fromId);
      const target = world.player(member.id);
      const eligible = from !== undefined && target !== undefined && canMakeChaos(from.id) && canMakeChaos(target.id) && Math.hypot(from.position.x - target.position.x, from.position.z - target.position.z) <= CHAOS_REACH;
      const placement = eligible && message.accept ? findGamePlacement([from, target], world.players(), chaos.roomGames()) : null;
      const players = chaos.answer(member.id, message.accept, now, placement ?? undefined);
      if (players !== null && placement !== null) {
        const spots = gamePlayerPositions(placement);
        for (const [index, id] of players.entries()) {
          world.placeForGame(id, spots[index] ?? placement.position, placement.rotation + index * Math.PI);
          chaos.wake(id);
        }
        sendGames(players);
      }
      else if (message.accept) refuse("Impossible de jouer ici : rapproche-toi d'un membre disponible et laisse de la place autour de vous.");
      return;
    }
    if (message.type === "game-hover") {
      chaos.hoverColumn(member.id, message.column, now);
      return;
    }
    if (message.type === "rps-pick") {
      chaos.pickRps(member.id, message.pick, now);
      sendGames(chaos.gamePlayers(member.id));
      return;
    }
    if (message.type === "connect4-drop") {
      chaos.dropDisc(member.id, message.column, now);
      sendGames(chaos.gamePlayers(member.id));
      return;
    }
    if (message.type === "quit-game") {
      quitGame(member.id);
      return;
    }
    if (chaos.gamePlayers(member.id).length > 0) return;

    if (!canMakeChaos(member.id)) {
      refuse("Pas de chahut depuis le box du jury ou la zone du procès.");
      return;
    }

    if (message.type === "toggle-sleep") {
      chaos.toggleSleep(member.id);
      return;
    }
    if (message.type === "shout-objection") {
      if (!chaos.ready(member.id, "objection", now)) return;

      broadcast({
        type: "effect",
        kind: "objection",
        fromId: member.id,
      });
      rebuke(OBJECTION_REBUKES);
      return;
    }
    if (message.type === "throw-tomato") {
      throwTomato(member.id, message, now);
      return;
    }

    if (message.type !== "whisper" && message.type !== "challenge" && message.type !== "fight") return;

    const target = targetNear(member.id, message.targetId, CHAOS_REACH);

    if (target === undefined) {
      refuse("Approche-toi d'abord.");
      return;
    }

    if (message.type === "whisper") {
      if (now - lastRumorAt < RUMOR_GAP_MS || !chaos.ready(member.id, "rumor", now)) {
        refuse("Les rumeurs mettent du temps à mûrir. Réessaie plus tard.");
        return;
      }

      lastRumorAt = now;
      broadcast({
        type: "effect",
        kind: "whisper",
        fromId: member.id,
        toId: target.id,
      });
      whisperRumor(member.id, target.id);
      return;
    }
    if (message.type === "challenge") {
      if (!canMakeChaos(target.id)) {
        refuse("Ce membre participe au procès.");
        return;
      }
      if (!chaos.ready(member.id, "challenge", now)) {
        refuse("Patiente un peu avant de lancer un nouveau défi.");
        return;
      }
      const challenge = chaos.challenge(
        {
          id: member.id,
          name: member.name,
        },
        target.id,
        message.game,
        now,
      );
      if (challenge === null) refuse("Ce membre est déjà occupé.");
      else sendTo(target.id, {
        type: "challenged",
        challenge,
      });
      return;
    }
    if (!canMakeChaos(target.id) || !chaos.ready(member.id, "fight", now) || !chaos.fight(member.id, target.id, now)) {
      refuse("Pas de baston possible maintenant.");
      return;
    }

    world.standUp(member.id);
    world.standUp(target.id);
  };

  const tick = (now: number, dtSeconds: number) => {
    for (const id of chaos.playerIdsInGames()) {
      if (!canMakeChaos(id)) quitGame(id);
    }
    const finished = chaos.expireGames(now);
    world.releaseGame(finished);
    for (const id of finished) sendTo(id, { type: "game", game: null });
    const { expelled } = chaos.tick(now, dtSeconds, (id) => world.player(id)?.position);
    for (const id of expelled) {
      world.expel(id);
      recordTrouble(id);
    }
    if (expelled.length > 0) rebuke(FIGHT_REBUKES);
  };

  return { chaos, handleChaos, quitGame, tick };
};
