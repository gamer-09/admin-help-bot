import {
  Message,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { AUTOMOD_CONFIG } from "./config";
import { addInfraction, getUserRecord } from "./database";

// ─── Spam Tracker ─────────────────────────────────────────────────────────────
// userId → array of message timestamps
const spamTracker = new Map<string, number[]>();

function trackSpam(userId: string): boolean {
  const now = Date.now();
  const timestamps = (spamTracker.get(userId) ?? []).filter(
    (t) => now - t < AUTOMOD_CONFIG.spam.windowMs
  );
  timestamps.push(now);
  spamTracker.set(userId, timestamps);
  return timestamps.length > AUTOMOD_CONFIG.spam.maxMessages;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isImmune(member: GuildMember): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return member.roles.cache.some((r) =>
    AUTOMOD_CONFIG.immuneRoles.includes(r.name) ||
    AUTOMOD_CONFIG.immuneRoles.includes(r.id)
  );
}

function containsBadWord(content: string): string | null {
  const lower = content.toLowerCase();
  for (const word of AUTOMOD_CONFIG.badWords.words) {
    // word boundary check: surrounded by non-alphanumeric chars or start/end
    const pattern = new RegExp(`(?<![a-z0-9])${word}(?![a-z0-9])`, "i");
    if (pattern.test(lower)) return word;
  }
  return null;
}

const INVITE_REGEX = /discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9-]+/i;
const URL_REGEX = /https?:\/\/[^\s]+/gi;

function containsInvite(content: string): boolean {
  return INVITE_REGEX.test(content);
}

function containsExternalLink(content: string): boolean {
  return URL_REGEX.test(content);
}

function capsPercent(content: string): number {
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (!letters.length) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return (upper / letters.length) * 100;
}

async function getLogChannel(message: Message): Promise<TextChannel | null> {
  const ch = message.guild?.channels.cache.find(
    (c) => c.name === AUTOMOD_CONFIG.logChannel || c.id === AUTOMOD_CONFIG.logChannel
  );
  return (ch as TextChannel) ?? null;
}

// ─── Action: warn via progressive system ─────────────────────────────────────

async function autoWarn(
  message: Message,
  member: GuildMember,
  reason: string,
  violationType: string
): Promise<void> {
  const existing = getUserRecord(member.id);
  const currentWarnings = existing?.warnings ?? 0;
  const newWarningNumber = currentWarnings + 1;

  type InfType = "warning" | "timeout" | "final_warning" | "ban";
  let infractionType: InfType = "warning";
  if (newWarningNumber === 2) infractionType = "timeout";
  else if (newWarningNumber === 3) infractionType = "final_warning";
  else if (newWarningNumber >= 4) infractionType = "ban";

  const { newWarningCount } = addInfraction(member.id, member.user.username, {
    type: infractionType,
    reason: `[Auto-Mod] ${reason}`,
    moderatorId: message.client.user!.id,
    moderatorName: message.client.user!.tag,
  });

  // DM the user
  const dmMessages: Record<string, string> = {
    warning:
      `⚠️ **Warning #${newWarningCount}** in **${message.guild!.name}**\n\n` +
      `**Violation:** ${violationType}\n**Detail:** ${reason}\n\n` +
      `Further violations will result in escalating consequences.`,
    timeout:
      `🔇 **You have been timed out** in **${message.guild!.name}**\n\n` +
      `This is your 2nd violation. You have been timed out for 10 minutes.\n` +
      `**Violation:** ${reason}`,
    final_warning:
      `🚨 **Final Warning** in **${message.guild!.name}**\n\n` +
      `This is your 3rd violation. One more will result in a permanent ban.\n` +
      `**Violation:** ${reason}`,
    ban:
      `🔨 **You have been banned** from **${message.guild!.name}**\n\n` +
      `Repeated violations of the server rules.\n**Violation:** ${reason}`,
  };

  const dmColors: Record<string, number> = {
    warning: 0xfee75c,
    timeout: 0xed4245,
    final_warning: 0xff0000,
    ban: 0xff0000,
  };

  try {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(dmColors[infractionType] ?? 0xfee75c)
          .setTitle(
            infractionType === "warning" ? "⚠️ Auto-Mod Warning" :
            infractionType === "timeout" ? "🔇 Auto-Mod Timeout" :
            infractionType === "final_warning" ? "🚨 Final Warning" : "🔨 Banned"
          )
          .setDescription(dmMessages[infractionType] ?? reason)
          .setTimestamp(),
      ],
    });
  } catch { /* DMs closed */ }

  // Execute escalating action
  if (infractionType === "timeout") {
    try { await member.timeout(10 * 60 * 1000, `Auto-Mod: ${reason}`); } catch { /* insufficient perms */ }
  } else if (infractionType === "ban") {
    try { await member.ban({ reason: `Auto-Mod (4th offense): ${reason}` }); } catch { /* insufficient perms */ }
  }

  // Log to mod-logs
  const logChannel = await getLogChannel(message);
  if (logChannel) {
    const actionLabel: Record<string, string> = {
      warning: "⚠️ Warning",
      timeout: "🔇 Timeout (10 min)",
      final_warning: "🚨 Final Warning",
      ban: "🔨 Ban",
    };
    await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(dmColors[infractionType] ?? 0xfee75c)
          .setTitle(`🤖 Auto-Mod Action — ${actionLabel[infractionType]}`)
          .addFields(
            { name: "User", value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: "Warning #", value: `${newWarningCount}`, inline: true },
            { name: "Violation Type", value: violationType, inline: true },
            { name: "Detail", value: reason },
            { name: "Channel", value: `<#${message.channelId}>`, inline: true },
            { name: "Message", value: message.content.slice(0, 200) || "(empty)", inline: false }
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setFooter({ text: "Auto-Mod System" })
          .setTimestamp(),
      ],
    }).catch(() => { /* log channel missing */ });
  }
}

// ─── Main Auto-Mod Handler ────────────────────────────────────────────────────

export async function handleAutoMod(message: Message): Promise<void> {
  // Ignore bots, DMs, and system messages
  if (message.author.bot || !message.guild || !message.member) return;

  const member = message.member;

  // Immune users (mods/admins/staff) bypass all checks
  if (isImmune(member)) return;

  const content = message.content;
  const channelName = (message.channel as TextChannel).name ?? "";

  // ── 1. Spam Detection ──────────────────────────────────────────────────────
  if (AUTOMOD_CONFIG.spam.enabled && trackSpam(message.author.id)) {
    try { await message.delete(); } catch { /* already deleted */ }
    await autoWarn(
      message, member,
      `Sending more than ${AUTOMOD_CONFIG.spam.maxMessages} messages in ${AUTOMOD_CONFIG.spam.windowMs / 1000}s`,
      "Spam"
    );
    return;
  }

  // ── 2. Bad Word Filter ─────────────────────────────────────────────────────
  if (AUTOMOD_CONFIG.badWords.enabled) {
    const found = containsBadWord(content);
    if (found) {
      try { await message.delete(); } catch { /* already deleted */ }
      await autoWarn(
        message, member,
        `Use of prohibited language: "${found}"`,
        "Prohibited Language"
      );
      return;
    }
  }

  // ── 3. Invite Link Filter ──────────────────────────────────────────────────
  if (AUTOMOD_CONFIG.inviteLinks.enabled) {
    const allowed = AUTOMOD_CONFIG.inviteLinks.allowedChannels.some(
      (c) => channelName === c || message.channelId === c
    );
    if (!allowed && containsInvite(content)) {
      try { await message.delete(); } catch { /* already deleted */ }
      await autoWarn(
        message, member,
        "Posting Discord invite links is not allowed",
        "Unauthorized Invite Link"
      );
      return;
    }
  }

  // ── 4. Mass Mention Filter ─────────────────────────────────────────────────
  if (AUTOMOD_CONFIG.massMention.enabled) {
    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > AUTOMOD_CONFIG.massMention.maxMentions) {
      try { await message.delete(); } catch { /* already deleted */ }
      await autoWarn(
        message, member,
        `Mass-mentioning ${mentionCount} users/roles in one message`,
        "Mass Mention"
      );
      return;
    }
  }

  // ── 5. Caps Spam Filter ────────────────────────────────────────────────────
  if (AUTOMOD_CONFIG.capsSpam.enabled) {
    if (
      content.length >= AUTOMOD_CONFIG.capsSpam.minLength &&
      capsPercent(content) >= AUTOMOD_CONFIG.capsSpam.maxCapsPercent
    ) {
      try { await message.delete(); } catch { /* already deleted */ }
      await autoWarn(
        message, member,
        "Excessive use of capital letters",
        "Caps Spam"
      );
      return;
    }
  }

  // ── 6. External Link Filter (optional, disabled by default) ───────────────
  if (AUTOMOD_CONFIG.externalLinks.enabled) {
    const allowed = AUTOMOD_CONFIG.externalLinks.allowedChannels.some(
      (c) => channelName === c || message.channelId === c
    );
    if (!allowed && containsExternalLink(content)) {
      try { await message.delete(); } catch { /* already deleted */ }
      await autoWarn(
        message, member,
        "External links are not allowed in this server",
        "Unauthorized Link"
      );
    }
  }
}
