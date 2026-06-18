import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResultRow } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://agentrelay:agentrelay@localhost:5432/agentrelay"
});

export async function migrate() {
  const schemaPath = path.resolve(__dirname, "../db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
}

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  const result = await pool.query<T>(text, params);
  return result;
}
