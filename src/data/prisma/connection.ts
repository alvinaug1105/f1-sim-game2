import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
/** Used only by the server singleton and short-lived CLI/test clients. */
export function createPrismaClient(connectionString: string) {
  const url = new URL(connectionString);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  const schema = url.searchParams.get("schema") ?? "public";
  url.searchParams.delete("schema");
  const adapter = new PrismaPg(
    { connectionString: url.toString(), connectionTimeoutMillis: 5000 },
    { schema },
  );
  return new PrismaClient({ adapter });
}
export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value)
    throw new Error(
      "DATABASE_URL is required for database operations. See .env.example.",
    );
  return value;
}
