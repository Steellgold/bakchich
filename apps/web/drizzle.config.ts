import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: { url: process.env.POSTGRESQL_URL ?? "" },
  out: "./drizzle",
  schema: "./lib/auth-schema.ts",
  // The bot keeps its own migrations in the same database:
  migrations: { table: "__drizzle_migrations_web" },
});
