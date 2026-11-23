import type { Trial } from "#/court/engine";
import type { KnownMember } from "#/court/members";
import type { RoomMember } from "#/room/access";
import type { Npc, ServerMessage, TrialView } from "#/room/protocol";
import type { Role } from "#/room/world";
import type { IncomingMessage } from "node:http";
import type { RawData } from "ws";
import { court } from "#/court/court";
import { formatVerdictLine } from "#/court/judge";
import { listKnownMembers, upsertMember } from "#/court/members";
import { AGENTS_CATEGORY_ID, discordClient, findDiscordGuildMember, ROYAUME_GUILD_ID } from "#/integrations/discord";
import { fetchSession } from "#/integrations/session";
import { authorizeConnection } from "#/room/access";
import { SEATS, TICK_MS } from "#/room/layout";
import { parseClientMessage } from "#/room/protocol";
import { pickDisplayedTrial, World } from "#/room/world";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { PermissionFlagsBits } from "discord.js";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const AUTH_TIMEOUT_MS = 5_000;
/** Longest move accepted at once, so a step can never jump through a rail */
const MAX_MOVE_ELAPSED_MS = 200;
const KNOWN_MEMBERS_REFRESH_MS = 60_000;
const KNOWN_MEMBERS_LIMIT = 100;

const world = new World();
const sockets = new Map<string, WebSocket>();
const lastMoveAt = new Map<string, number>();
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

const checkMember = async (discordId: string) => {
  const guild = await discordClient.guilds.fetch(ROYAUME_GUILD_ID);
  const member = await findDiscordGuildMember(guild, discordId);
  if (member === null) return null;

  const category = await guild.channels.fetch(AGENTS_CATEGORY_ID);
  return {
    name: member.displayName,
    avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }),
    canViewAgents: category?.permissionsFor(member).has(PermissionFlagsBits.ViewChannel) === true,
  };
};

// Without a cookie (e.g. inside a Discord Activity), the client sends its session token as the first message:
const waitForTokenCookie = async (socket: WebSocket) => new Promise<string | null>((resolve) => {
  const timer = setTimeout(() => {
    resolve(null);
  }, AUTH_TIMEOUT_MS);

  socket.once("message", (raw) => {
    clearTimeout(timer);
    const message = parseClientMessage(rawText(raw));
    resolve(message?.type === "auth" ? `better-auth.session_token=${message.token}` : null);
  });
});

const trialView = (trial: Trial): TrialView => ({
  id: trial.id,
  accused: trial.accused,
  plaintiff: trial.plaintiff,
  lawyer: trial.lawyer,
  crime: trial.crime,
  phase: trial.phase,
  endsAt: trial.phaseEndsAt,
});

// Absent members shown seated: convoked players of the displayed trial in their seats, then known members on the benches.
const npcs = (): Npc[] => {
  const avatarOf = (id: string) => knownMembers.find((member) => member.id === id)?.avatarUrl ?? null;
  const roles: [Role, { id: string; name: string } | null | undefined][] = [["accused", displayed?.accused], ["prosecutor", displayed?.plaintiff], ["defense", displayed?.lawyer]];

  const convoked = roles.flatMap(([role, member]) => (member === null || member === undefined || sockets.has(member.id) ? [] : [{ ...member, avatarUrl: avatarOf(member.id), seatId: SEATS[role].id }]));
  const convokedIds = new Set(roles.map(([, member]) => member?.id));

  const benchers = knownMembers.filter((member) => !sockets.has(member.id) && !convokedIds.has(member.id));
  const seated = SEATS.benches.flatMap((seat, index) => {
    const member = benchers[index];
    return member === undefined ? [] : [{ id: member.id, name: member.name, avatarUrl: member.avatarUrl, seatId: seat.id }];
  });

  return [...convoked, ...seated];
};

const handleMessage = (member: RoomMember, socket: WebSocket, raw: string) => {
  const message = parseClientMessage(raw);
  if (message === null) return;

  if (message.type === "move") {
    const now = Date.now();
    const elapsed = Math.min(now - (lastMoveAt.get(member.id) ?? now - TICK_MS), MAX_MOVE_ELAPSED_MS);
    lastMoveAt.set(member.id, now);
    world.move(member.id, { x: message.x, z: message.z }, message.rotation, elapsed);
    return;
  }
  if (message.type === "become-juror") {
    world.becomeJuror(member.id);
    return;
  }
  if (message.type === "stand-up") {
    world.standUp(member.id);
    return;
  }
  if (message.type === "vote") {
    send(socket, { type: "vote-result", result: displayed === null ? "no-trial" : court.vote(displayed.channelId, member.id, message.guilty) });
  }
};

const onConnection = async (socket: WebSocket, request: IncomingMessage) => {
  const cookie = request.headers.cookie ?? await waitForTokenCookie(socket);
  const access = await authorizeConnection({
    getSession: async () => (cookie === null ? null : fetchSession(cookie)),
    checkMember,
  });

  if (!access.ok) {
    send(socket, { type: "rejected", reason: access.reason });
    socket.close();
    return;
  }

  const { member } = access;
  const previous = sockets.get(member.id);
  if (previous !== undefined) {
    send(previous, { type: "rejected", reason: "Connecté ailleurs." });
    previous.close();
  }

  world.join(member);
  sockets.set(member.id, socket);
  send(socket, { type: "welcome", selfId: member.id });
  logger.info(`Room: ${member.name} joined (${String(sockets.size)} connected)`);

  socket.on("message", (raw) => {
    handleMessage(member, socket, rawText(raw));
  });
  socket.on("close", () => {
    // A replaced connection must not remove its successor:
    if (sockets.get(member.id) !== socket) return;
    sockets.delete(member.id);
    lastMoveAt.delete(member.id);
    world.leave(member.id);
  });

  await upsertMember(member);
};

const refreshKnownMembers = async () => {
  knownMembers = await listKnownMembers(KNOWN_MEMBERS_LIMIT);
};

court.on("event", (event) => {
  if (event.trial.id !== displayed?.id) return;
  if (event.type === "speech") broadcast({ type: "speech", speakerId: event.speakerId, text: event.text });
  if (event.type === "verdict") broadcast({ type: "verdict", line: formatVerdictLine(event.verdict, null) });
});

setInterval(() => {
  displayed = pickDisplayedTrial(displayed, court.list());
  world.setTrial(displayed);
  broadcast({ type: "snapshot", players: world.players(), npcs: npcs(), trial: displayed === null ? null : trialView(displayed) });
}, TICK_MS);

setInterval(trigger.safeListener("Room known members refresh", refreshKnownMembers), KNOWN_MEMBERS_REFRESH_MS);
trigger.safeListener("Room known members refresh", refreshKnownMembers)();

const server = createServer((_request, response) => {
  response.writeHead(404).end();
});
const webSocketServer = new WebSocketServer({ server, path: "/ws" });
webSocketServer.on("connection", trigger.safeListener("Room connection", onConnection));
server.listen(env.ROOM_PORT, () => {
  logger.info(`Room WebSocket server listening on port ${String(env.ROOM_PORT)}`);
});
