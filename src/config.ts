// ─── Auto-Mod Configuration ──────────────────────────────────────────────────
// Edit these values to tune the bot's behaviour for your server.

export const AUTOMOD_CONFIG = {
  // Roles that are immune from auto-mod (by role name or ID)
  immuneRoles: ["Admin", "Moderator", "Mod", "Staff"],

  // ── Spam Detection ────────────────────────────────────────────────────────
  spam: {
    enabled: true,
    // Max messages allowed within the window before action
    maxMessages: 5,
    // Time window in milliseconds
    windowMs: 5000,
  },

  // ── Bad Word Filter ───────────────────────────────────────────────────────
  badWords: {
    enabled: true,
    // Add or remove words from this list
    words: [
      "nigga", "nigger", "faggot", "fag", "retard", "cunt",
      "chink", "spic", "kike", "tranny",
      "fuck", "fucker", "fucking", "motherfucker",
      "shit", "bullshit",
      "pussy", "asshole", "bastard", "bitch",
      "dick", "cock", "whore", "slut",
    ],
  },

  // ── Discord Invite Link Filter ────────────────────────────────────────────
  inviteLinks: {
    enabled: true,
    // Allow links in these channel names/IDs
    allowedChannels: ["partnerships", "promotions", "self-promo"],
  },

  // ── Mass Mention Filter ───────────────────────────────────────────────────
  massMention: {
    enabled: true,
    // Max @mentions (users + roles) per message
    maxMentions: 5,
  },

  // ── Caps Spam Filter ──────────────────────────────────────────────────────
  capsSpam: {
    enabled: true,
    // Minimum message length before caps check applies
    minLength: 10,
    // Minimum percentage of uppercase characters to trigger (0-100)
    maxCapsPercent: 70,
  },

  // ── External Link Filter ──────────────────────────────────────────────────
  externalLinks: {
    enabled: false, // Disabled by default — enable if you want a stricter server
    allowedChannels: ["links", "resources"],
  },

  // ── Log Channel ───────────────────────────────────────────────────────────
  // Name of the channel where auto-mod actions are logged
  logChannel: "mod-logs",
};
