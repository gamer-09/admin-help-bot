import {
  Message,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { addInfraction, getUserRecord, getEffectiveConfig, getAutoModCooldown, setAutoModCooldown, isMessageProcessed, markMessageProcessed } from "./database";

// ─── Spam Tracker ─────────────────────────────────────────────────────────────
const spamTracker = new Map<string, number[]>();

function trackSpam(userId: string, windowMs: number, maxMessages: number): boolean {
  const now = Date.now();
  const timestamps = (spamTracker.get(userId) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  if (timestamps.length > maxMessages) {
    // Reset so the NEXT batch of messages is tracked independently.
    // Without this, every message after the threshold also fires a warning.
    spamTracker.set(userId, []);
    return true;
  }
  spamTracker.set(userId, timestamps);
  return false;
}

// ─── Per-user action cooldown ─────────────────────────────────────────────────
// Prevents any rule from issuing more than one warning per user within the window.
const actionCooldown = new Map<string, number>();
const ACTION_COOLDOWN_MS = 8_000; // 8 s — covers the default 5 s spam window

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isImmune(member: GuildMember, immuneRoles: string[]): boolean {
  // Check owner explicitly — partial GuildMember objects can have an
  // empty permission cache, so never rely on permissions alone for the owner.
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return member.roles.cache.some((r) =>
    immuneRoles.includes(r.name) || immuneRoles.includes(r.id)
  );
}

function containsBadWord(content: string, words: string[]): string | null {
  const lower = content.toLowerCase();
  for (const word of words) {
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

async function getLogChannel(message: Message, logChannelName: string): Promise<TextChannel | null> {
  const ch = message.guild?.channels.cache.find(
    (c) => c.name === logChannelName || c.id === logChannelName
  );
  return (ch as TextChannel) ?? null;
}

// ─── Action: warn via progressive system ─────────────────────────────────────

async function autoWarn(
  message: Message,
  member: GuildMember,
  reason: string,
  violationType: string,
  logChannelName: string
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

  if (infractionType === "timeout") {
    try { await member.timeout(10 * 60 * 1000, `Auto-Mod: ${reason}`); } catch { /* insufficient perms */ }
  } else if (infractionType === "ban") {
    try { await member.ban({ reason: `Auto-Mod (4th offense): ${reason}` }); } catch { /* insufficient perms */ }
  }

  const logChannel = await getLogChannel(message, logChannelName);
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

// ─── Detect which rule a message breaks (null = clean) ───────────────────────

function detectViolation(
  message: Message,
  cfg: ReturnType<typeof getEffectiveConfig>
): { reason: string; type: string } | null {
  const content = message.content;
  const channelName = (message.channel as TextChannel).name ?? "";

  if (cfg.spam.enabled && trackSpam(message.author.id, cfg.spam.windowMs, cfg.spam.maxMessages)) {
    return { reason: `Sending more than ${cfg.spam.maxMessages} messages in ${cfg.spam.windowMs / 1000}s`, type: "Spam" };
  }
  if (cfg.badWords.enabled) {
    const found = containsBadWord(content, cfg.badWords.words);
    if (found) return { reason: `Use of prohibited language: "${found}"`, type: "Prohibited Language" };
  }
  if (cfg.inviteLinks.enabled) {
    const allowed = cfg.inviteLinks.allowedChannels.some((c) => channelName === c || message.channelId === c);
    if (!allowed && containsInvite(content)) return { reason: "Posting Discord invite links is not allowed", type: "Unauthorized Invite Link" };
  }
  if (cfg.massMention.enabled) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > cfg.massMention.maxMentions) return { reason: `Mass-mentioning ${mentionCount} users/roles in one message`, type: "Mass Mention" };
  }
  if (cfg.capsSpam.enabled && content.length >= cfg.capsSpam.minLength && capsPercent(content) >= cfg.capsSpam.maxCapsPercent) {
    return { reason: "Excessive use of capital letters", type: "Caps Spam" };
  }
  if (cfg.externalLinks.enabled) {
    const allowed = cfg.externalLinks.allowedChannels.some((c) => channelName === c || message.channelId === c);
    if (!allowed && containsExternalLink(content)) return { reason: "External links are not allowed in this server", type: "Unauthorized Link" };
  }
  return null;
}

// ─── Nudge immune members who break a rule ────────────────────────────────────

async function sendImmuneNudge(message: Message, violationType: string, reason: string): Promise<void> {
  const guildName = message.guild!.name;
  try {
    await message.author.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("👀 Just a friendly reminder…")
          .setDescription(
            `Hey ${message.author}, you broke one of **${guildName}**'s rules — but since you're a staff member, the bot didn't take action.\n\n` +
            `**Rule triggered:** ${violationType}\n` +
            `**Detail:** ${reason}\n\n` +
            `The community looks to you to set the example. Keep it clean! 😊`
          )
          .setFooter({ text: `${guildName} • Auto-Mod (immune reminder)` })
          .setTimestamp(),
      ],
    });
  } catch { /* DMs closed — silently ignore */ }
}

// ─── Main Auto-Mod Handler ────────────────────────────────────────────────────

export async function handleAutoMod(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.member) return;

  const member = message.member;
  const cfg = getEffectiveConfig();
  const violation = detectViolation(message, cfg);

  if (!violation) return;

  // ── Atomic dedup via Discord API ──────────────────────────────────────────
  // A Discord message can only be deleted once. Attempting deletion first
  // means whichever handler call succeeds is the ONLY one that proceeds.
  // Every other concurrent call (duplicate listener, overlapping deploy, etc.)
  // will get an Unknown Message error here and exit — preventing duplicate DMs.
  try {
    await message.delete();
  } catch {
    return; // Another handler already processed this exact message — exit.
  }

  // From here we are guaranteed to be the single handler for this message.
  if (isImmune(member, cfg.immuneRoles)) {
    await sendImmuneNudge(message, violation.type, violation.reason);
    return;
  }

  await autoWarn(message, member, violation.reason, violation.type, cfg.logChannel);
}
