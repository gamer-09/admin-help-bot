import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { AUTOMOD_CONFIG } from "./config";

const DB_PATH = process.env["DATA_DIR"]
  ? join(process.env["DATA_DIR"], "bot-data.json")
  : join(process.cwd(), "bot-data.json");

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
  lastWarnedAt?: number; // unix ms — used to deduplicate across bot instances
}

export interface ConfigOverride {
  spam?: { enabled?: boolean; maxMessages?: number; windowMs?: number };
  badWords?: { enabled?: boolean; words?: string[] };
  inviteLinks?: { enabled?: boolean; allowedChannels?: string[] };
  massMention?: { enabled?: boolean; maxMentions?: number };
  capsSpam?: { enabled?: boolean; minLength?: number; maxCapsPercent?: number };
  externalLinks?: { enabled?: boolean; allowedChannels?: string[] };
  logChannel?: string;
}

interface BotDatabase {
  users: Record<string, UserRecord>;
  config?: ConfigOverride;
  welcomeChannel?: string;
  processedMessages?: Record<string, number>; // messageId → timestamp (pruned after 60 s)
}

// ── In-memory cache ────────────────────────────────────────────────────────────
// All reads/writes go through this cache so changes are immediately visible
// within the same process lifetime, even if the file write fails.
let memoryDB: BotDatabase | null = null;

function loadDB(): BotDatabase {
  if (memoryDB !== null) return memoryDB;
  if (!existsSync(DB_PATH)) {
    memoryDB = { users: {} };
    return memoryDB;
  }
  try {
    memoryDB = JSON.parse(readFileSync(DB_PATH, "utf-8")) as BotDatabase;
  } catch {
    memoryDB = { users: {} };
  }
  return memoryDB;
}

function saveDB(db: BotDatabase): void {
  memoryDB = db;
  try {
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch {
    // File write failed (read-only or missing disk) — in-memory cache is still
    // up to date so the bot continues working for this session.
  }
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

export function getWelcomeChannel(): string | null {
  return loadDB().welcomeChannel ?? null;
}

export function saveWelcomeChannel(channelId: string): void {
  const db = loadDB();
  db.welcomeChannel = channelId;
  saveDB(db);
}

export function getEffectiveConfig(): typeof AUTOMOD_CONFIG {
  const override = loadDB().config ?? {};
  // Always return fresh copies of arrays so handlers can mutate them safely
  return {
    immuneRoles: [...AUTOMOD_CONFIG.immuneRoles],
    logChannel: override.logChannel ?? AUTOMOD_CONFIG.logChannel,
    spam: {
      enabled: override.spam?.enabled ?? AUTOMOD_CONFIG.spam.enabled,
      maxMessages: override.spam?.maxMessages ?? AUTOMOD_CONFIG.spam.maxMessages,
      windowMs: override.spam?.windowMs ?? AUTOMOD_CONFIG.spam.windowMs,
    },
    badWords: {
      enabled: override.badWords?.enabled ?? AUTOMOD_CONFIG.badWords.enabled,
      words: override.badWords?.words != null
        ? [...override.badWords.words]
        : [...AUTOMOD_CONFIG.badWords.words],
    },
    inviteLinks: {
      enabled: override.inviteLinks?.enabled ?? AUTOMOD_CONFIG.inviteLinks.enabled,
      allowedChannels: override.inviteLinks?.allowedChannels
        ? [...override.inviteLinks.allowedChannels]
        : [...AUTOMOD_CONFIG.inviteLinks.allowedChannels],
    },
    massMention: {
      enabled: override.massMention?.enabled ?? AUTOMOD_CONFIG.massMention.enabled,
      maxMentions: override.massMention?.maxMentions ?? AUTOMOD_CONFIG.massMention.maxMentions,
    },
    capsSpam: {
      enabled: override.capsSpam?.enabled ?? AUTOMOD_CONFIG.capsSpam.enabled,
      minLength: override.capsSpam?.minLength ?? AUTOMOD_CONFIG.capsSpam.minLength,
      maxCapsPercent: override.capsSpam?.maxCapsPercent ?? AUTOMOD_CONFIG.capsSpam.maxCapsPercent,
    },
    externalLinks: {
      enabled: override.externalLinks?.enabled ?? AUTOMOD_CONFIG.externalLinks.enabled,
      allowedChannels: override.externalLinks?.allowedChannels
        ? [...override.externalLinks.allowedChannels]
        : [...AUTOMOD_CONFIG.externalLinks.allowedChannels],
    },
  };
}


// ── Message-ID dedup (primary guard against duplicate auto-mod actions) ────
// Each Discord message has a unique snowflake ID.  Recording it the moment we
// start processing means any second handler call — from an overlapping deploy,
// a reconnect, or an accidentally-doubled listener — is dropped immediately.

export function isMessageProcessed(messageId: string): boolean {
  const db = loadDB();
  const now = Date.now();
  const pm = db.processedMessages ?? {};
  let changed = false;
  for (const id of Object.keys(pm)) {
    if (now - pm[id] > 60_000) { delete pm[id]; changed = true; }
  }
  if (changed) { db.processedMessages = pm; saveDB(db); }
  return !!pm[messageId];
}

export function markMessageProcessed(messageId: string): void {
  const db = loadDB();
  if (!db.processedMessages) db.processedMessages = {};
  db.processedMessages[messageId] = Date.now();
  saveDB(db);
}

// ── Per-user cooldown (secondary guard, stored for cross-instance safety) ───
export function getAutoModCooldown(userId: string): number {
  return loadDB().users[userId]?.lastWarnedAt ?? 0;
}

export function setAutoModCooldown(userId: string, username: string): void {
  const db2 = loadDB();
  if (!db2.users[userId]) {
    db2.users[userId] = { userId, username, warnings: 0, infractions: [], lastWarnedAt: Date.now() };
  } else {
    db2.users[userId].lastWarnedAt = Date.now();
  }
  saveDB(db2);
}

export function saveConfigOverride(patch: ConfigOverride): void {
  const db = loadDB();
  const existing = db.config ?? {};
  db.config = {
    ...existing,
    ...(patch.logChannel !== undefined ? { logChannel: patch.logChannel } : {}),
    spam: patch.spam ? { ...existing.spam, ...patch.spam } : existing.spam,
    badWords: patch.badWords ? { ...existing.badWords, ...patch.badWords } : existing.badWords,
    inviteLinks: patch.inviteLinks ? { ...existing.inviteLinks, ...patch.inviteLinks } : existing.inviteLinks,
    massMention: patch.massMention ? { ...existing.massMention, ...patch.massMention } : existing.massMention,
    capsSpam: patch.capsSpam ? { ...existing.capsSpam, ...patch.capsSpam } : existing.capsSpam,
    externalLinks: patch.externalLinks ? { ...existing.externalLinks, ...patch.externalLinks } : existing.externalLinks,
  };
  saveDB(db);
}
