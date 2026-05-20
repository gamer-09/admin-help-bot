import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "bot-data.json");

export interface Infraction {
  id: string;
  type: "warning" | "timeout" | "final_warning" | "ban";
  reason: string;
  moderatorId: string;
  moderatorName: string;
  timestamp: string;
}

export interface UserRecord {
  userId: string;
  username: string;
  warnings: number;
  infractions: Infraction[];
}

interface BotDatabase {
  users: Record<string, UserRecord>;
}

function loadDB(): BotDatabase {
  if (!existsSync(DB_PATH)) return { users: {} };
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8")) as BotDatabase;
  } catch {
    return { users: {} };
  }
}

function saveDB(db: BotDatabase): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function getUser(userId: string, username: string): UserRecord {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = { userId, username, warnings: 0, infractions: [] };
    saveDB(db);
  }
  return db.users[userId];
}

export function getUserRecord(userId: string): UserRecord | null {
  return loadDB().users[userId] ?? null;
}

export function addInfraction(
  userId: string,
  username: string,
  infraction: Omit<Infraction, "id" | "timestamp">
): { user: UserRecord; newWarningCount: number } {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = { userId, username, warnings: 0, infractions: [] };
  }
  const user = db.users[userId];
  user.username = username;

  user.infractions.push({
    ...infraction,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  });

  if (infraction.type !== "ban") {
    user.warnings += 1;
  }

  db.users[userId] = user;
  saveDB(db);
  return { user, newWarningCount: user.warnings };
}

export function clearWarnings(userId: string): boolean {
  const db = loadDB();
  if (!db.users[userId]) return false;
  db.users[userId].warnings = 0;
  saveDB(db);
  return true;
}
