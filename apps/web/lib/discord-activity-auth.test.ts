import { discordActivityAuth } from "./discord-activity-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer } from "better-auth/plugins";
import assert from "node:assert/strict";
import { test } from "node:test";

const clientId = "123456789012345678";
const activityOrigin = `https://${clientId}.discordsays.com`;
const codeVerifier = "a".repeat(43);
const credentials = { clientId, clientSecret: "test-client-secret" };

const fixture = () => {
  const database: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: "https://tribunal.example",
    secret: "test-secret-long-enough-for-better-auth-validation",
    database: memoryAdapter(database),
    socialProviders: { discord: credentials },
    trustedOrigins: [activityOrigin],
    plugins: [discordActivityAuth(credentials), bearer()],
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
  const signIn = async (body: unknown, origin = activityOrigin) => auth.handler(new Request("https://tribunal.example/api/auth/sign-in/discord-activity", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  }));
  return { auth, database, signIn };
};

const discordProfile = {
  id: "987654321098765432",
  username: "temoin",
  global_name: "Le témoin",
  email: "temoin@example.com",
  verified: true,
  avatar: null,
  discriminator: "0",
};

test("Activity sign-in exchanges PKCE code and creates a Discord account with a usable bearer session", async (context) => {
  const { auth, database, signIn } = fixture();
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, init });
    if (url === "https://discord.com/api/oauth2/token") return Promise.resolve(Response.json({ access_token: "discord-access-token", refresh_token: "discord-refresh-token", expires_in: 3600, scope: "identify email" }));
    assert.equal(decodeURIComponent(url), "https://discord.com/api/users/@me");
    return Promise.resolve(Response.json(discordProfile));
  });

  const response = await signIn({ code: "discord-code", codeVerifier });
  assert.equal(response.status, 200);
  const result = await response.json() as { accessToken: string; token: string };
  assert.equal(result.accessToken, "discord-access-token");
  assert.ok(result.token);
  assert.match(response.headers.get("set-cookie") ?? "", /better-auth\.session_token=/u);

  const exchange = requests[0];
  assert.equal(exchange?.init?.method, "POST");
  assert.ok(exchange.init.body instanceof URLSearchParams);
  assert.equal(exchange.init.body.get("client_id"), clientId);
  assert.equal(exchange.init.body.get("client_secret"), credentials.clientSecret);
  assert.equal(exchange.init.body.get("code"), "discord-code");
  assert.equal(exchange.init.body.get("code_verifier"), codeVerifier);
  assert.equal(exchange.init.body.get("grant_type"), "authorization_code");
  assert.equal(exchange.init.body.has("redirect_uri"), false);
  assert.equal(database.account?.[0]?.providerId, "discord");
  assert.equal(database.account[0].accountId, discordProfile.id);

  const sessionResponse = await auth.handler(new Request("https://tribunal.example/api/auth/get-session", {
    headers: { authorization: `Bearer ${result.token}` },
  }));
  const session = await sessionResponse.json() as { user: { email: string } };
  assert.equal(session.user.email, discordProfile.email);

  assert.equal((await signIn({ code: "second-code", codeVerifier })).status, 200);
  assert.equal(database.user?.length, 1);
  assert.equal(database.account.length, 1);
});

test("Activity sign-in rejects missing or invalid PKCE input before contacting Discord", async (context) => {
  const { database, signIn } = fixture();
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Promise.resolve(Response.json({})));
  for (const body of [{ code: "code" }, { code: "", codeVerifier }, { code: "code", codeVerifier: "short" }, { code: "code", codeVerifier: "+".repeat(43) }]) {
    assert.equal((await signIn(body)).status, 400);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(database.session?.length, 0);
});

test("Activity sign-in rejects an untrusted first-login origin without cookies", async (context) => {
  const { database, signIn } = fixture();
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Promise.resolve(Response.json({})));
  assert.equal((await signIn({ code: "code", codeVerifier }, "https://another-activity.discordsays.com")).status, 403);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(database.session?.length, 0);
});

test("Activity sign-in refuses rejected Discord codes without creating a session", async (context) => {
  const { database, signIn } = fixture();
  context.mock.method(globalThis, "fetch", async () => Promise.resolve(Response.json({ error: "invalid_grant" }, { status: 400 })));
  assert.equal((await signIn({ code: "expired-code", codeVerifier })).status, 401);
  assert.equal(database.user?.length, 0);
  assert.equal(database.session?.length, 0);
});

test("Activity sign-in refuses malformed Discord token responses", async (context) => {
  const { database, signIn } = fixture();
  context.mock.method(globalThis, "fetch", async () => Promise.resolve(Response.json({ access_token: "token" })));
  assert.equal((await signIn({ code: "code", codeVerifier })).status, 502);
  assert.equal(database.session?.length, 0);
});

test("Activity sign-in requires a server-verified Discord profile with email", async (context) => {
  const { database, signIn } = fixture();
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://discord.com/api/oauth2/token") return Promise.resolve(Response.json({ access_token: "token", expires_in: 3600, scope: "identify" }));
    return Promise.resolve(Response.json({ ...discordProfile, email: null }));
  });
  assert.equal((await signIn({ code: "code", codeVerifier })).status, 401);
  assert.equal(database.session?.length, 0);
});
