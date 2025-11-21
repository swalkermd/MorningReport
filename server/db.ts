import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Allow running without DB if not strictly required (e.g. using FileStorage)
// We provide a dummy URL to satisfy Drizzle's initialization, but DB operations will fail if used.
const url = process.env.DATABASE_URL || "postgres://dummy:dummy@localhost:5432/dummy";

if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL is not set. Database features will not work.");
}

export const db = drizzle(url, { schema });
