import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync, chmodSync, existsSync } from "node:fs";
import { getConfigDir } from "../config/loader.js";
import { SCHEMA_SQL } from "./schema.js";

export function openDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? join(getConfigDir(), "trade.db");
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  const isNew = !existsSync(path);
  const db = new Database(path);
  if (isNew) {
    chmodSync(path, 0o600);
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}
