export const NOT_LOGGED_IN = "Connecte-toi avec Discord.";
export const NOT_A_MEMBER = "Réservé aux membres du Royaume.";

export type RoomMember = { id: string; name: string; avatarUrl: string | null };

export type AccessResult = { ok: true; member: RoomMember } | { ok: false; reason: string };

export type AccessDeps = {
  getSession: () => Promise<{ discordId: string | null } | null>;
  checkMember: (discordId: string) => Promise<{ name: string; avatarUrl: string | null; canViewAgents: boolean } | null>;
};

/** Courtroom access: a Discord login, membership of the Royaume and the right to see the AGENTS category */
export const authorizeConnection = async ({ getSession, checkMember }: AccessDeps): Promise<AccessResult> => {
  const discordId = (await getSession())?.discordId ?? null;
  if (discordId === null) return { ok: false, reason: NOT_LOGGED_IN };

  const member = await checkMember(discordId);
  if (member?.canViewAgents !== true) return { ok: false, reason: NOT_A_MEMBER };

  return { ok: true, member: { id: discordId, name: member.name, avatarUrl: member.avatarUrl } };
};
