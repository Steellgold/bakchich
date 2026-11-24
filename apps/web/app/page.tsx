import { HomeClient } from "@/features/activity/home-client";
import { requireEnv } from "@/lib/env";

// Read at runtime so one Docker image works for any app:
export const dynamic = "force-dynamic";

const HomePage = () => <HomeClient clientId={requireEnv("DISCORD_CLIENT_ID")} />;

export default HomePage;
