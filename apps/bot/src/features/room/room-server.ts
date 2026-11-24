import type { Trial } from "#/features/court/engine";
import type { KnownMember } from "#/features/court/members";
import type { RoomMember } from "#/features/room/access";
import type { ClientMessage, Npc, ServerMessage, TrialView } from "#/features/room/protocol";
import type { IncomingMessage } from "node:http";
import type { RawData } from "ws";
import { recordIncident } from "#/features/clerk/clerk";
import { court, judge } from "#/features/court/court";
import { floorOf } from "#/features/court/engine";
import { formatVerdictLine } from "#/features/court/judge";
import { listKnownMembers, upsertMember } from "#/features/court/members";
import { isInHearingVoice, judgeSays } from "#/features/hearings/hearings";
import { listFiles } from "#/features/profiles/profiles";
import { authorizeConnection } from "#/features/room/access";
import { Chaos, CHAOS_REACH } from "#/features/room/chaos";
import { ARCHIVES, ARCHIVES_RADIUS, MAX_SPEED, RUN_SPEED, SEATS, TICK_MS } from "#/features/room/layout";
import { parseClientMessage } from "#/features/room/protocol";
import { pickDisplayedTrial, World } from "#/features/room/world";
import { AGENTS_CATEGORY_IDS, discordClient, findDiscordGuildMember, GUILD_IDS } from "#/integrations/discord";
import { fetchSession } from "#/integrations/session";
import { speakingIds, speakingLevels } from "#/integrations/voice";
import { attempt } from "#/utils/attempt";
import { EMOJI, limitEmojis } from "#/utils/emojis";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { PermissionFlagsBits } from "discord.js";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const AUTH_TIMEOUT_MS = 5_000;
/**
 * Distance a member may walk refills at MAX_SPEED (RUN_SPEED while running) and is spent by their moves. Moves bunched by network jitter
 * still catch up with the client, while the average speed stays capped; the cap keeps a burst after a lag spike short.
 */
const MAX_MOVE_BUDGET = RUN_SPEED * 0.5;
const KNOWN_MEMBERS_REFRESH_MS = 60_000;
const KNOWN_MEMBERS_LIMIT = 100;
/** Client messages are tiny JSON intents */
const MAX_PAYLOAD_BYTES = 4 * 1024;
const ROOM_UNAVAILABLE = "Salle indisponible, réessaie plus tard.";

const world = new World();
const sockets = new Map<string, WebSocket>();
const moveBudgets = new Map<
  string,
  {
    distance: number;
    at: number;
  }
>();
let displayed: Trial | null = null;
let knownMembers: KnownMember[] = [];

const send = (socket: WebSocket, message: ServerMessage) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};

const broadcast = (message: ServerMessage) => {
  for (const socket of sockets.values()) send(socket, message);
};

const rawText = (raw: RawData): string => {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");

  return raw.toString("utf8");
};

/** The member in the first allowed guild where they see an AGENTS category, else in the first one they belong to; null when in none */
const checkMember = async (discordId: string) => {
  let found: {
    name: string;
    avatarUrl: string;
    canViewAgents: boolean;
  } | null = null;

  for (const guildId of GUILD_IDS) {
    const guild = await discordClient.guilds.fetch(guildId);
    // Forced fetch: without the GuildMembers intent the cache never learns about kicks or role changes.
    const member = await findDiscordGuildMember(guild, discordId, { force: true });

    if (member === null) continue;

    const canViewAgents = AGENTS_CATEGORY_IDS.some((id) => guild.channels.cache.get(id)?.permissionsFor(member).has(PermissionFlagsBits.ViewChannel) === true);
    found ??= {
      name: member.displayName,
      avatarUrl: member.displayAvatarURL({
        extension: "png",
        size: 128,
      }),
      canViewAgents,
    };

    if (canViewAgents) return { ...found, canViewAgents };
  }

  return found;
};

// Start listening before checking cookies: an Activity sends its token as soon as the socket opens.
const waitForToken = (socket: WebSocket) => {
  let cancel: () => void = () => undefined;
  const promise = new Promise<string | null>((resolve) => {
    const onMessage = (raw: RawData) => {
      const message = parseClientMessage(rawText(raw));
      resolve(message?.type === "auth" ? message.token : null);
    };
    const onClose = () => resolve(null);
    const timer = setTimeout(onClose, AUTH_TIMEOUT_MS);
    cancel = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("close", onClose);
      resolve(null);
    };

    socket.once("message", onMessage);
    socket.once("close", onClose);
  }).finally(() => cancel());
  return { promise, cancel };
};

const trialView = (trial: Trial): TrialView => ({
  id: trial.id,
  accused: trial.accused,
  plaintiff: trial.plaintiff,
  lawyer: trial.lawyer,
  witness: trial.witness?.member ?? null,
  crime: trial.crime,
  style: trial.style,
  mode: trial.mode,
  phase: trial.phase,
  floor: floorOf(trial),
  endsAt: trial.phaseEndsAt,
});

// Absent convoked players of the displayed trial, shown in their seats. Anyone else who is not connected is not in the room.
const npcs = (): Npc[] => {
  const avatarOf = (id: string) => knownMembers.find((member) => member.id === id)?.avatarUrl ?? null;
  const convened: [
    (
      | {
        id: string;
        name: string;
      }
      | null
      | undefined
    ),
    string | undefined,
  ][] = [
    ...(displayed?.accused ?? []).map(
      (
        member,
        index,
      ): [
        {
          id: string;
          name: string;
        },
        string | undefined,
      ] => [member, SEATS.accused[index]?.id],
    ),
    [displayed?.plaintiff, SEATS.prosecutor.id],
    [displayed?.lawyer, SEATS.defense.id],
    [displayed?.witness?.member, SEATS.witness.id],
  ];

  return convened.flatMap(([member, seatId]) => member === null || member === undefined || seatId === undefined || sockets.has(member.id) ? [] : [
    {
      ...member,
      avatarUrl: avatarOf(member.id),
      seatId,
    },
  ],
  );
};

// ── Chaos in the audience ──────────────────────────────────────────────────────────────────────────
// The judge reacts out loud to the chaos with canned lines (no AI), at most once in a while:
const JUDGE_REBUKE_GAP_MS = 30_000;
const RUMOR_GAP_MS = 15_000;
const TOMATO_REACH = CHAOS_REACH * 3;

const chaos = new Chaos();
let lastRebukeAt = 0;
let lastRumorAt = 0;

const OBJECTION_REBUKES = [
  "Le public n'a pas le droit d'objecter. Le public a le droit de se taire.",
  "Objection du public rejetée. Et notée. Et jugée.",
  "Encore une objection depuis les bancs et je fais évacuer la salle.",
] as const;

const FIGHT_REBUKES = [`Trouble à l'audience ! Gardes, sortez-moi ces deux énergumènes. ${EMOJI.policeArrest}`, `On se bat dans mon tribunal ? Ce sera noté au casier. ${EMOJI.policeWarning}`] as const;

/** The judge rebukes the room out loud, only during a trial and not too often */
const rebuke = (lines: readonly string[]) => {
  const line = chaos.pick(lines);

  if (displayed === null || line === undefined || Date.now() - lastRebukeAt < JUDGE_REBUKE_GAP_MS) return;

  lastRebukeAt = Date.now();
  court.say(displayed.channelId, null, line);
  judgeSays(displayed.channelId, line);
};

/** Chaos is for the audience standing or on the benches: not for the parties, nor for the jurors in their box */
const canMakeChaos = (id: string) => {
  const state = world.player(id);
  return state?.role === null && state.seatId?.startsWith("jury-") !== true;
};

/** Another connected member close enough */
const targetNear = (id: string, targetId: string, reach: number) => {
  const self = world.player(id);
  const target = world.player(targetId);

  if (self === undefined || target === undefined || targetId === id) return undefined;

  return Math.hypot(self.position.x - target.position.x, self.position.z - target.position.z) <= reach ? target : undefined;
};

const nameOf = (id: string) => world.player(id)?.name ?? "Quelqu'un";

const sendTo = (id: string, message: ServerMessage) => {
  const socket = sockets.get(id);
  if (socket !== undefined) send(socket, message);
};

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

/** Chaos messages from a member of the audience, every rule checked here */
const handleChaos = (member: RoomMember, socket: WebSocket, message: ClientMessage) => {
  const now = Date.now();
  const refuse = (reason: string) => send(socket, {
    type: "chaos-refused",
    reason,
  });

  if (message.type === "answer-challenge") {
    const players = chaos.answer(member.id, message.accept, now);
    if (players !== null) sendGames(players);
    return;
  }
  if (message.type === "rps-pick") {
    chaos.pickRps(member.id, message.pick);
    sendGames(chaos.gamePlayers(member.id));
    return;
  }
  if (message.type === "connect4-drop") {
    chaos.dropDisc(member.id, message.column);
    sendGames(chaos.gamePlayers(member.id));
    return;
  }
  if (message.type === "quit-game") {
    for (const id of chaos.quitGame(member.id)) sendTo(id, {
      type: "game",
      game: null,
    });

    return;
  }

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
    if (targetNear(member.id, message.targetId, TOMATO_REACH) === undefined) {
      refuse("Trop loin pour viser.");
      return;
    }
    if (!chaos.ready(member.id, "tomato", now)) return;

    chaos.splat(message.targetId, now);
    broadcast({
      type: "effect",
      kind: "tomato",
      fromId: member.id,
      toId: message.targetId,
    });
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

/** A jump is a short hop everyone sees: no physics, only while standing and free, once per JUMP_GAP_MS */
const JUMP_GAP_MS = 700;
const lastJumps = new Map<string, number>();

const jump = (id: string) => {
  const now = Date.now();

  if (world.player(id)?.seatId !== null || chaos.isFighting(id) || now - (lastJumps.get(id) ?? 0) < JUMP_GAP_MS) return;

  lastJumps.set(id, now);
  chaos.wake(id);
  broadcast({
    type: "effect",
    kind: "jump",
    fromId: id,
  });
};

/** A member at the archive cabinet reads the clerk's files */
const openArchives = trigger.safeListener("Archives", async (id: string, socket: WebSocket) => {
  const position = world.player(id)?.position;

  if (position === undefined || Math.hypot(position.x - ARCHIVES.x, position.z - ARCHIVES.z) > ARCHIVES_RADIUS + 0.5) return;

  const files = await listFiles();
  send(socket, {
    type: "archives",
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      avatarUrl: file.avatarUrl,
      profile: file.profile ?? "",
    })),
  });
});

const handleMessage = (member: RoomMember, socket: WebSocket, raw: string) => {
  const message = parseClientMessage(raw);

  if (message === null) return;

  if (message.type === "move") {
    // Fighters are held until the police comes; walking wakes a sleeper up.
    if (chaos.isFighting(member.id)) return;

    chaos.wake(member.id);
    const now = Date.now();
    const speed = message.running === true ? RUN_SPEED : MAX_SPEED;
    const previous = moveBudgets.get(member.id) ?? {
      distance: (speed * TICK_MS) / 1_000,
      at: now,
    };
    const budget = Math.min(previous.distance + (speed * (now - previous.at)) / 1_000, MAX_MOVE_BUDGET);
    const walked = world.move(
      member.id,
      {
        x: message.x,
        z: message.z,
      },
      message.rotation,
      budget,
    );
    moveBudgets.set(member.id, {
      distance: budget - walked,
      at: now,
    });
    return;
  }
  if (message.type === "become-juror") {
    world.becomeJuror(member.id);
    return;
  }
  if (message.type === "sit-on-bench") {
    world.sitOnBench(member.id);
    return;
  }
  if (message.type === "sit-down") {
    world.sitDown(member.id);
    return;
  }
  if (message.type === "stand-up") {
    world.standUp(member.id);
    return;
  }
  if (message.type === "open-archives") {
    openArchives(member.id, socket);
    return;
  }
  if (message.type === "jump") {
    jump(member.id);
    return;
  }
  if (message.type === "vote") {
    if (displayed === null) send(socket, {
      type: "vote-result",
      result: "no-trial",
    });
    // Same rule as the Discord buttons: only the members in the voice channel of the trial vote.
    else if (!isInHearingVoice(displayed.channelId, member.id)) send(socket, {
      type: "vote-result",
      result: "not-in-voice",
    });
    else send(socket, {
      type: "vote-result",
      result: court.vote(displayed.channelId, member.id, message.guilty),
    });
    return;
  }

  handleChaos(member, socket, message);
};

const reject = (socket: WebSocket, reason: string) => {
  send(socket, {
    type: "rejected",
    reason,
  });
  socket.close();
};

const authorize = async (socket: WebSocket, request: IncomingMessage) => {
  const pendingToken = waitForToken(socket);
  const cookieSession = request.headers.cookie === undefined ? null : await fetchSession({ cookie: request.headers.cookie });
  if (cookieSession !== null) pendingToken.cancel();
  const token = cookieSession === null ? await pendingToken.promise : null;

  return authorizeConnection({
    getSession: async () => cookieSession ?? (token === null ? null : fetchSession({ token })),
    checkMember,
  });
};

const onConnection = async (socket: WebSocket, request: IncomingMessage) => {
  // Protocol errors (malformed frames, oversized messages) must close this socket only, never crash the process:
  socket.on("error", (error) => {
    logger.warn(`Room socket error: ${error.message}`);
    socket.terminate();
  });

  const access = await attempt(async () => authorize(socket, request));

  // The browser may have left while it was being authorized:
  if (socket.readyState !== WebSocket.OPEN) return;

  if (!access.ok) {
    logger.error("Room authorization failed:", access.error instanceof Error ? access.error.stack : String(access.error));
    reject(socket, ROOM_UNAVAILABLE);
    return;
  }
  if (!access.value.ok) {
    reject(socket, access.value.reason);
    return;
  }

  const { member } = access.value;
  const previous = sockets.get(member.id);
  if (previous !== undefined) reject(previous, "Connecté ailleurs.");

  world.join(member);
  sockets.set(member.id, socket);
  send(socket, {
    type: "welcome",
    selfId: member.id,
  });
  logger.info(`Room: ${member.name} joined (${String(sockets.size)} connected)`);

  socket.on("message", (raw) => {
    handleMessage(member, socket, rawText(raw));
  });
  socket.on("close", () => {
    // A replaced connection must not remove its successor:
    if (sockets.get(member.id) !== socket) return;

    sockets.delete(member.id);
    moveBudgets.delete(member.id);

    for (const id of chaos.quitGame(member.id)) sendTo(id, {
      type: "game",
      game: null,
    });

    chaos.forget(member.id);
    world.leave(member.id);
  });

  await upsertMember(member);
};

const refreshKnownMembers = async () => {
  knownMembers = await listKnownMembers(KNOWN_MEMBERS_LIMIT);
};

// The displayed trial leaves the court at its verdict, before its sentence is written: the last one shown is remembered for the verdict line.
let lastShownTrialId: string | null = null;

court.on("event", (event) => {
  if (event.type === "sentenced" && event.trial.id === lastShownTrialId) broadcast({
    type: "verdict",
    line: limitEmojis(`${formatVerdictLine(event.verdict, event.sentence)} ${event.verdict.guilty ? EMOJI.policeArrest : EMOJI.clerkApproval}`),
  });
  if (event.trial.id !== displayed?.id) return;

  if (event.type === "speech") broadcast({
    type: "speech",
    speakerId: event.speakerId,
    text: limitEmojis(event.text),
  });
});

setInterval(() => {
  // The police throws the fighters out and the casier remembers:
  const { expelled } = chaos.tick(Date.now(), TICK_MS / 1_000, (id) => world.player(id)?.position);

  for (const id of expelled) {
    world.expel(id);
    recordTrouble(id);
  }

  if (expelled.length > 0) rebuke(FIGHT_REBUKES);

  displayed = pickDisplayedTrial(displayed, court.list());
  if (displayed !== null) lastShownTrialId = displayed.id;
  world.setTrial(displayed);
  const players = world.players();
  broadcast({
    type: "snapshot",
    players,
    npcs: npcs(),
    speaking: [...speakingIds],
    levels: Object.fromEntries(speakingLevels),
    ...chaos.view(),
    trial: displayed === null ? null : trialView(displayed),
  });
}, TICK_MS);

setInterval(trigger.safeListener("Room known members refresh", refreshKnownMembers), KNOWN_MEMBERS_REFRESH_MS);
trigger.safeListener("Room known members refresh", refreshKnownMembers)();

const server = createServer((_request, response) => {
  response.writeHead(404).end();
});
// Any path is accepted: the proxy may forward "/ws" as is or strip it, and this server only serves the room.
const webSocketServer = new WebSocketServer({
  server,
  maxPayload: MAX_PAYLOAD_BYTES,
});

webSocketServer.on("connection", trigger.safeListener("Room connection", onConnection));
server.listen(env.ROOM_PORT, () => {
  logger.info(`Room WebSocket server listening on port ${String(env.ROOM_PORT)}`);
});
