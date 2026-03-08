import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { getConfigDir } from "../config/loader.js";
import { SCHEMA_SQL } from "./schema.js";

export function openDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? join(getConfigDir(), "trade.db");
  mkdirSync(join(path, ".."), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}
