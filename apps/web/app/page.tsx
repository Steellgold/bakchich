import { HomeClient } from "@/components/home-client";
import { auth } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { headers } from "next/headers";

const HomePage = async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  return <HomeClient clientId={requireEnv("DISCORD_CLIENT_ID")} signedIn={session !== null} />;
};

export default HomePage;
