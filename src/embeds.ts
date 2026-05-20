import { EmbedBuilder, GuildMember, type ColorResolvable } from "discord.js";
import type { UserRecord } from "./database";

export function welcomeEmbed(member: GuildMember): EmbedBuilder {
  const guild = member.guild;
  const serverIcon = guild.iconURL({ size: 256 }) ?? undefined;
  const joinPosition = guild.memberCount;

  const suffix =
    joinPosition % 100 >= 11 && joinPosition % 100 <= 13
      ? "th"
      : joinPosition % 10 === 1
      ? "st"
      : joinPosition % 10 === 2
      ? "nd"
      : joinPosition % 10 === 3
      ? "rd"
      : "th";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: member.user.tag,
      iconURL: member.user.displayAvatarURL({ size: 256 }),
    })
    .setTitle(`🎉 Welcome to ${guild.name}!`)
    .setDescription(
      `Hey ${member}, we're so glad you found us! 👋\n\n` +
        `You're our **${joinPosition.toLocaleString()}${suffix} member** — the community just got better. 🌟\n\n` +
        `Here's how to get started:`
    )
    .addFields(
      {
        name: "📜 Read the Rules",
        value: "Head to the rules channel and give them a quick read so you know what's what.",
        inline: false,
      },
      {
        name: "👋 Introduce Yourself",
        value: "Drop a message in the introductions channel and say hi — we don't bite!",
        inline: false,
      },
      {
        name: "🛡️ Need Help?",
        value: "Use `/ticket` to reach a moderator privately, or `/report` if you spot a problem.",
        inline: false,
      }
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setImage(serverIcon ?? null)
    .setFooter({
      text: `${guild.name} • We're happy you're here!`,
      iconURL: serverIcon,
    })
    .setTimestamp();
}

export function warningEmbed(
  target: GuildMember,
  reason: string,
  warningCount: number,
  moderatorName: string
): EmbedBuilder {
  const color: ColorResolvable =
    warningCount === 1 ? 0xfee75c : warningCount === 2 ? 0xed4245 : 0xff0000;
  const titles: Record<number, string> = {
    1: "⚠️ Warning Issued",
    2: "🔇 Warning #2 — Timeout Applied",
    3: "🚨 Final Warning Issued",
  };
  const title = titles[warningCount] ?? "🔨 User Banned";

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: "User", value: `${target} (${target.user.tag})`, inline: true },
      { name: "Warning #", value: `${warningCount}`, inline: true },
      { name: "Moderator", value: moderatorName, inline: true },
      { name: "Reason", value: reason }
    )
    .setThumbnail(target.user.displayAvatarURL())
    .setTimestamp();
}

export function infractionListEmbed(record: UserRecord): EmbedBuilder {
  const recent = record.infractions.slice(-10).reverse();
  const typeLabel: Record<string, string> = {
    warning: "⚠️ Warning",
    timeout: "🔇 Timeout",
    final_warning: "🚨 Final Warning",
    ban: "🔨 Ban",
  };
  const lines = recent.map((inf) => {
    const date = new Date(inf.timestamp).toLocaleDateString();
    return `**${typeLabel[inf.type]}** — ${date}\n> ${inf.reason} *(by ${inf.moderatorName})*`;
  });

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Infraction History: ${record.username}`)
    .setDescription(lines.length ? lines.join("\n\n") : "No infractions on record.")
    .addFields({ name: "Total Warnings", value: `${record.warnings}`, inline: true })
    .setTimestamp();
}

export function timeoutEmbed(
  target: GuildMember,
  reason: string,
  durationMinutes: number,
  moderatorName: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔇 User Timed Out")
    .addFields(
      { name: "User", value: `${target} (${target.user.tag})`, inline: true },
      { name: "Duration", value: `${durationMinutes} minute(s)`, inline: true },
      { name: "Moderator", value: moderatorName, inline: true },
      { name: "Reason", value: reason }
    )
    .setThumbnail(target.user.displayAvatarURL())
    .setTimestamp();
}

export function kickEmbed(
  target: GuildMember,
  reason: string,
  moderatorName: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("👢 User Kicked")
    .addFields(
      { name: "User", value: `${target} (${target.user.tag})`, inline: true },
      { name: "Moderator", value: moderatorName, inline: true },
      { name: "Reason", value: reason }
    )
    .setThumbnail(target.user.displayAvatarURL())
    .setTimestamp();
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setTitle("❌ Error").setDescription(message);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x57f287).setTitle("✅ Success").setDescription(message);
}

export function serverStatsEmbed(
  guildName: string,
  memberCount: number,
  channelCount: number,
  roleCount: number,
  createdAt: Date,
  ownerId: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 Server Info: ${guildName}`)
    .addFields(
      { name: "👥 Members", value: `${memberCount}`, inline: true },
      { name: "📢 Channels", value: `${channelCount}`, inline: true },
      { name: "🏷️ Roles", value: `${roleCount}`, inline: true },
      { name: "👑 Owner", value: `<@${ownerId}>`, inline: true },
      { name: "📅 Created", value: createdAt.toLocaleDateString(), inline: true }
    )
    .setTimestamp();
}
