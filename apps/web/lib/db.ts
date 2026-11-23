import { requireEnv } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle(requireEnv("POSTGRESQL_URL"));
