import {
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { addInfraction, getUserRecord, clearWarnings, getUser, getEffectiveConfig, saveConfigOverride, saveWelcomeChannel, getWelcomeChannel } from "./database";
import {
  warningEmbed, timeoutEmbed, kickEmbed, infractionListEmbed,
  errorEmbed, successEmbed, serverStatsEmbed, welcomeEmbed,
} from "./embeds";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

async function fetchMember(interaction: ChatInputCommandInteraction, userId: string): Promise<GuildMember | null> {
  try { return await interaction.guild!.members.fetch(userId); }
  catch { return null; }
}

export async function handleWarn(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const moderator = interaction.member as GuildMember;

  if (targetUser.id === interaction.user.id) {
    await interaction.editReply({ embeds: [errorEmbed("You cannot warn yourself.")] }); return;
  }
  const member = await fetchMember(interaction, targetUser.id);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed("Could not find that member.")] }); return;
  }
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.editReply({ embeds: [errorEmbed("You cannot warn a moderator or admin.")] }); return;
  }

  const existing = getUserRecord(targetUser.id);
  const currentWarnings = existing?.warnings ?? 0;
  const newWarningNumber = currentWarnings + 1;

  type InfractionType = "warning" | "timeout" | "final_warning" | "ban";
  let infractionType: InfractionType = "warning";
  if (newWarningNumber === 2) infractionType = "timeout";
  else if (newWarningNumber === 3) infractionType = "final_warning";
  else if (newWarningNumber >= 4) infractionType = "ban";

  const { newWarningCount } = addInfraction(targetUser.id, targetUser.username, {
    type: infractionType, reason, moderatorId: moderator.id, moderatorName: moderator.user.tag,
  });

  const embed = warningEmbed(member, reason, newWarningCount, moderator.user.tag);

  if (infractionType === "timeout") {
    try {
      await member.timeout(DEFAULT_TIMEOUT_MS, `Warning #2 — ${reason}`);
      embed.setFooter({ text: "⏱ 10-minute timeout applied automatically." });
    } catch { embed.setFooter({ text: "⚠️ Could not apply timeout — check bot permissions." }); }
    try {
      await member.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🔇 You have been timed out")
        .setDescription(`You received your **2nd warning** in **${interaction.guild!.name}** and have been timed out for 10 minutes.\n\n**Reason:** ${reason}\n\nPlease review the server rules.`)] });
    } catch { /* DMs closed */ }
  } else if (infractionType === "final_warning") {
    try {
      await member.send({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("🚨 Final Warning")
        .setDescription(`This is your **final warning** in **${interaction.guild!.name}**.\n\n**Reason:** ${reason}\n\nOne more violation results in a permanent ban.`)] });
    } catch { /* DMs closed */ }
  } else if (infractionType === "ban") {
    try {
      await member.send({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("🔨 You have been banned")
        .setDescription(`You have been **permanently banned** from **${interaction.guild!.name}**.\n\n**Reason:** ${reason}`)] });
    } catch { /* DMs closed */ }
    try {
      await member.ban({ reason: `4th offense — ${reason}`, deleteMessageSeconds: 0 });
      embed.setFooter({ text: "🔨 User permanently banned (4th offense)." });
    } catch { embed.setFooter({ text: "⚠️ Could not ban — check bot permissions." }); }
  } else {
    try {
      await member.send({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("⚠️ You have received a warning")
        .setDescription(`You received a warning in **${interaction.guild!.name}**.\n\n**Reason:** ${reason}\n\nThis is warning #1. Further violations will escalate.`)] });
    } catch { /* DMs closed */ }
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function handleTimeout(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const minutes = interaction.options.getInteger("duration") ?? 10;
  const moderator = interaction.member as GuildMember;
  const member = await fetchMember(interaction, targetUser.id);
  if (!member) { await interaction.editReply({ embeds: [errorEmbed("Member not found.")] }); return; }
  try {
    await member.timeout(minutes * 60 * 1000, reason);
    addInfraction(targetUser.id, targetUser.username, { type: "timeout", reason, moderatorId: moderator.id, moderatorName: moderator.user.tag });
    await interaction.editReply({ embeds: [timeoutEmbed(member, reason, minutes, moderator.user.tag)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to timeout: ${e}`)] }); }
}

export async function handleUntimeout(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user", true);
  const member = await fetchMember(interaction, targetUser.id);
  if (!member) { await interaction.editReply({ embeds: [errorEmbed("Member not found.")] }); return; }
  try {
    await member.timeout(null);
    await interaction.editReply({ embeds: [successEmbed(`Timeout removed for ${member.user.tag}.`)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to remove timeout: ${e}`)] }); }
}

export async function handleKick(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const moderator = interaction.member as GuildMember;
  const member = await fetchMember(interaction, targetUser.id);
  if (!member) { await interaction.editReply({ embeds: [errorEmbed("Member not found.")] }); return; }
  if (!member.kickable) { await interaction.editReply({ embeds: [errorEmbed("I cannot kick that user.")] }); return; }
  try {
    await member.kick(reason);
    await interaction.editReply({ embeds: [kickEmbed(member, reason, moderator.user.tag)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to kick: ${e}`)] }); }
}

export async function handleBan(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
  const moderator = interaction.member as GuildMember;
  const member = await fetchMember(interaction, targetUser.id);
  if (member && !member.bannable) { await interaction.editReply({ embeds: [errorEmbed("I cannot ban that user.")] }); return; }
  try {
    await interaction.guild!.members.ban(targetUser.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
    addInfraction(targetUser.id, targetUser.username, { type: "ban", reason, moderatorId: moderator.id, moderatorName: moderator.user.tag });
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("🔨 User Banned")
      .addFields({ name: "User", value: targetUser.tag, inline: true }, { name: "Moderator", value: moderator.user.tag, inline: true }, { name: "Reason", value: reason }).setTimestamp()] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to ban: ${e}`)] }); }
}

export async function handleUnban(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const userId = interaction.options.getString("userid", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  try {
    await interaction.guild!.members.unban(userId, reason);
    await interaction.editReply({ embeds: [successEmbed(`<@${userId}> has been unbanned.\nReason: ${reason}`)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to unban: ${e}`)] }); }
}

export async function handleClearWarnings(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const targetUser = interaction.options.getUser("user", true);
  const cleared = clearWarnings(targetUser.id);
  await interaction.editReply({ embeds: [cleared
    ? successEmbed(`All warnings cleared for ${targetUser.tag}.`)
    : errorEmbed(`No record found for ${targetUser.tag}.`)] });
}

export async function handleInfractions(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const targetUser = interaction.options.getUser("user", true);
  const record = getUserRecord(targetUser.id);
  if (!record) {
    getUser(targetUser.id, targetUser.username);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57f287)
      .setTitle(`📋 Infraction History: ${targetUser.username}`).setDescription("No infractions on record.").setTimestamp()] });
    return;
  }
  await interaction.editReply({ embeds: [infractionListEmbed(record)] });
}

export async function handlePurge(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const amount = interaction.options.getInteger("amount", true);
  const targetUser = interaction.options.getUser("user");
  const channel = interaction.channel as TextChannel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [errorEmbed("This command only works in text channels.")] }); return;
  }
  try {
    let messages = await channel.messages.fetch({ limit: amount });
    if (targetUser) messages = messages.filter((m) => m.author.id === targetUser.id);
    const deleted = await channel.bulkDelete(messages, true);
    await interaction.editReply({ embeds: [successEmbed(`Deleted **${deleted.size}** message(s).`)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to purge: ${e}`)] }); }
}

export async function handleAnnounce(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const message = interaction.options.getString("message", true);
  const title = interaction.options.getString("title") ?? "📢 Announcement";
  const targetChannel = (interaction.options.getChannel("channel") as TextChannel | null) ?? (interaction.channel as TextChannel);
  try {
    await targetChannel.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(message)
      .setFooter({ text: `Announced by ${interaction.user.tag}` }).setTimestamp()] });
    await interaction.editReply({ embeds: [successEmbed(`Announcement posted in <#${targetChannel.id}>.`)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to announce: ${e}`)] }); }
}

export async function handleSlowmode(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const seconds = interaction.options.getInteger("seconds", true);
  const targetChannel = (interaction.options.getChannel("channel") as TextChannel | null) ?? (interaction.channel as TextChannel);
  try {
    await targetChannel.setRateLimitPerUser(seconds);
    await interaction.editReply({ embeds: [successEmbed(seconds === 0
      ? `Slowmode disabled in <#${targetChannel.id}>.`
      : `Slowmode set to **${seconds}s** in <#${targetChannel.id}>.`)] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to set slowmode: ${e}`)] }); }
}

export async function handleLock(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reason = interaction.options.getString("reason") ?? "Channel locked by moderator";
  const channel = interaction.channel as TextChannel;
  const everyoneRole = interaction.guild!.roles.everyone;
  try {
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🔒 Channel Locked")
      .setDescription(`This channel has been locked.\n**Reason:** ${reason}`)] });
    await interaction.editReply({ embeds: [successEmbed("Channel locked.")] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to lock: ${e}`)] }); }
}

export async function handleUnlock(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.channel as TextChannel;
  const everyoneRole = interaction.guild!.roles.everyone;
  try {
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("🔓 Channel Unlocked")
      .setDescription("This channel has been unlocked. You may now send messages.")] });
    await interaction.editReply({ embeds: [successEmbed("Channel unlocked.")] });
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to unlock: ${e}`)] }); }
}

export async function handleRole(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const action = interaction.options.getString("action", true) as "add" | "remove";
  const targetUser = interaction.options.getUser("user", true);
  const role = interaction.options.getRole("role", true);
  const member = await fetchMember(interaction, targetUser.id);
  if (!member) { await interaction.editReply({ embeds: [errorEmbed("Member not found.")] }); return; }
  try {
    if (action === "add") {
      await member.roles.add(role.id);
      await interaction.editReply({ embeds: [successEmbed(`Added <@&${role.id}> to ${member.user.tag}.`)] });
    } else {
      await member.roles.remove(role.id);
      await interaction.editReply({ embeds: [successEmbed(`Removed <@&${role.id}> from ${member.user.tag}.`)] });
    }
  } catch (e) { await interaction.editReply({ embeds: [errorEmbed(`Failed to modify role: ${e}`)] }); }
}

export async function handleServerInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const guild = interaction.guild!;
  await interaction.editReply({ embeds: [serverStatsEmbed(guild.name, guild.memberCount, guild.channels.cache.size, guild.roles.cache.size, guild.createdAt, guild.ownerId)] });
}

export async function handleUserInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const member = await fetchMember(interaction, targetUser.id);
  const record = getUserRecord(targetUser.id);
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`👤 User Info: ${targetUser.tag}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields({ name: "ID", value: targetUser.id, inline: true }, { name: "Account Created", value: targetUser.createdAt.toLocaleDateString(), inline: true });
  if (member) embed.addFields(
    { name: "Joined Server", value: member.joinedAt?.toLocaleDateString() ?? "Unknown", inline: true },
    { name: "Roles", value: member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => `<@&${r.id}>`).join(", ") || "None" }
  );
  embed.addFields({ name: "⚠️ Warnings", value: `${record?.warnings ?? 0}`, inline: true }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

export async function handleSetupRules(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const targetChannel =
    (interaction.options.getChannel("channel") as TextChannel | null) ??
    (interaction.guild!.channels.cache.find(
      (c) => c.name === "rules" || c.name === "server-rules" || c.name === "📜rules"
    ) as TextChannel | undefined) ??
    (interaction.channel as TextChannel);

  const guildName = interaction.guild!.name;
  const guildIcon = interaction.guild!.iconURL({ size: 256 }) ?? undefined;

  try {
    // Header embed
    await targetChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📜 ${guildName} — Server Rules`)
          .setDescription(
            `Welcome to **${guildName}**! To keep this a safe and enjoyable community for everyone, ` +
            `please read and follow all rules below.\n\n` +
            `Violations are handled by our moderation team and auto-mod system.\n` +
            `Consequences escalate with each offence:\n\n` +
            `> ⚠️ **1st offence** — Warning\n` +
            `> 🔇 **2nd offence** — 10-minute timeout\n` +
            `> 🚨 **3rd offence** — Final warning\n` +
            `> 🔨 **4th offence** — Permanent ban`
          )
          .setThumbnail(guildIcon ?? null)
          .setTimestamp(),
      ],
    });

    // Rules embed
    await targetChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📋 General Conduct")
          .addFields(
            {
              name: "Rule 1 — Respect Everyone",
              value:
                "Treat all members with respect. Harassment, bullying, personal attacks, " +
                "or any form of targeted negativity toward another member is strictly prohibited.",
            },
            {
              name: "Rule 2 — No Hate Speech or Slurs",
              value:
                "The use of slurs, hate speech, or language that discriminates against any person " +
                "based on race, ethnicity, gender, sexuality, religion, or disability is **not tolerated** " +
                "and will result in an immediate warning or ban.",
            },
            {
              name: "Rule 3 — No Spam",
              value:
                "Do not send repeated messages, walls of text, or flood any channel. " +
                "This includes sending more than 5 messages in a 5-second window, " +
                "excessive use of emojis, or copy-pasting the same content repeatedly.",
            },
            {
              name: "Rule 4 — No Caps Spam",
              value:
                "Avoid messages that are predominantly uppercase (70%+ caps). " +
                "This is considered aggressive and disruptive to conversation.",
            },
          ),
      ],
    });

    await targetChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🔗 Links & Promotions")
          .addFields(
            {
              name: "Rule 5 — No Unauthorized Invite Links",
              value:
                "Posting Discord server invite links anywhere outside of designated promotional channels " +
                "is not allowed. This includes DM advertising after meeting in this server.",
            },
            {
              name: "Rule 6 — No Mass Mentions",
              value:
                "Do not mention (ping) more than 5 users or roles in a single message. " +
                "Unnecessary pinging of @everyone or @here without admin permission is also prohibited.",
            },
            {
              name: "Rule 7 — No NSFW Content",
              value:
                "Explicit, adult, or not-safe-for-work content of any kind is strictly prohibited " +
                "outside of age-restricted channels (if any exist). This includes images, links, and text.",
            },
          ),
      ],
    });

    await targetChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🛠️ Channels & Topics")
          .addFields(
            {
              name: "Rule 8 — Stay On Topic",
              value:
                "Keep conversations relevant to the channel you are in. " +
                "Read the channel description before posting to make sure you are in the right place.",
            },
            {
              name: "Rule 9 — No Impersonation",
              value:
                "Do not impersonate other members, staff, bots, or public figures. " +
                "This includes using similar names, avatars, or roles to deceive others.",
            },
            {
              name: "Rule 10 — Follow Discord's Terms of Service",
              value:
                "All members must comply with [Discord's Terms of Service](https://discord.com/terms) " +
                "and [Community Guidelines](https://discord.com/guidelines) at all times.",
            },
          ),
      ],
    });

    // Community safety commands embed
    await targetChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("🛡️ Community Safety Commands")
          .setDescription("Every member has access to these commands to help keep the server safe:")
          .addFields(
            {
              name: "/report <user> <reason>",
              value:
                "See someone breaking the rules? Report them directly to the moderation team. " +
                "Your report is sent privately — other members won't see it.",
            },
            {
              name: "/ticket <subject>",
              value:
                "Need to speak with a moderator privately? Open a support ticket and a staff member " +
                "will respond in a private thread as soon as possible.",
            },
            {
              name: "/appeal <reason>",
              value:
                "Received a warning you think was unfair? Submit an appeal and the moderation team " +
                "will review your case and your infraction history.",
            },
          ),
      ],
    });

    // Footer / contact embed
    await targetChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ By being in this server, you agree to all rules above.")
          .setDescription(
            `If you see someone breaking the rules, **do not engage** — use \`/report\` to alert the moderation team privately.\n\n` +
            `Our moderation bot monitors the server 24/7 and will act automatically on clear violations. ` +
            `Staff review all actions and can adjust them if needed.\n\n` +
            `**Thank you for being part of ${guildName}! Enjoy your stay. 🎉**`
          )
          .setFooter({ text: `${guildName} Moderation Team`, iconURL: guildIcon })
          .setTimestamp(),
      ],
    });

    await interaction.editReply({
      embeds: [successEmbed(`Server rules posted in <#${targetChannel.id}>.`)],
    });
  } catch (e) {
    await interaction.editReply({ embeds: [errorEmbed(`Failed to post rules: ${e}`)] });
  }
}

export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🤖 Admin Help Bot — Command Reference")
        .setDescription("Full list of all available commands. Commands are restricted to members with the appropriate Discord permissions.")
        .addFields(
          {
            name: "⚠️ Progressive Discipline",
            value:
              "`/warn <user> <reason>` — Issue a warning. Auto-escalates:\n" +
              "› **1st** → Warning DM\n" +
              "› **2nd** → 10-min timeout\n" +
              "› **3rd** → Final warning DM\n" +
              "› **4th** → Permanent ban",
          },
          {
            name: "🔨 Moderation",
            value:
              "`/timeout <user> <reason> [duration]` — Manually timeout a user\n" +
              "`/untimeout <user>` — Remove a timeout\n" +
              "`/kick <user> <reason>` — Kick a user from the server\n" +
              "`/ban <user> <reason> [delete_days]` — Permanently ban a user\n" +
              "`/unban <userid> [reason]` — Unban a user by ID",
          },
          {
            name: "📋 Infraction Records",
            value:
              "`/infractions <user>` — View a user's full warning history\n" +
              "`/clearwarnings <user>` — Reset all warnings for a user",
          },
          {
            name: "🛠️ Admin Tools",
            value:
              "`/purge <amount> [user]` — Bulk delete up to 100 messages\n" +
              "`/announce <message> [title] [channel]` — Post a formatted announcement\n" +
              "`/slowmode <seconds> [channel]` — Set channel slowmode (0 to disable)\n" +
              "`/lock [reason]` — Lock current channel (members can't send)\n" +
              "`/unlock` — Unlock current channel\n" +
              "`/role <add|remove> <user> <role>` — Add or remove a role",
          },
          {
            name: "📜 Server Setup",
            value:
              "`/setuprules [channel]` — Post the full server rules embed into #rules\n" +
              "› Auto-finds your #rules channel by name\n" +
              "› Posts 5 formatted embeds covering all 10 server rules\n" +
              "`/setwelcome <channel>` — Set the channel where welcome messages are posted\n" +
              "`/testwelcome [user]` — Preview the welcome message without anyone joining",
          },
          {
            name: "ℹ️ Info",
            value:
              "`/serverinfo` — View server stats (members, channels, roles)\n" +
              "`/userinfo [user]` — View a user's info and warning count\n" +
              "`/help` — Show this command reference",
          },
          {
            name: "🤖 Auto-Mod (always active)",
            value:
              "The bot watches every message 24/7 and acts automatically:\n" +
              "› **Spam** — 5+ messages in 5 seconds\n" +
              "› **Hate speech / slurs** — Instant delete + warn\n" +
              "› **Invite links** — Deleted outside allowed channels\n" +
              "› **Mass mentions** — 5+ pings in one message\n" +
              "› **Caps spam** — 70%+ uppercase messages\n" +
              "All violations are logged to #mod-logs and follow the same discipline scale.",
          },
          {
            name: "🎉 Welcome System (always active)",
            value: "A welcome embed is posted in #welcome whenever a new member joins.",
          },
          {
            name: "🛡️ Community Safety (available to all members)",
            value:
              "`/report <user> <reason>` — Report a user to the mod team privately\n" +
              "`/ticket <subject>` — Open a private support thread with staff\n" +
              "`/appeal <reason>` — Appeal a warning or punishment",
          },
          {
            name: "⚙️ Configuration (Admin only)",
            value:
              "`/config view` — Show all current automod settings\n" +
              "`/config toggle <feature> <on|off>` — Enable or disable a feature\n" +
              "`/config badwords <add|remove> <word>` — Edit the bad word list\n" +
              "`/config spam [threshold] [window]` — Adjust spam detection\n" +
              "`/config caps <threshold>` — Set caps-spam % threshold\n" +
              "`/config logchannel <channel>` — Set the mod-log channel",
          }
        )
        .setFooter({ text: "Mod commands require Moderate Members or higher • Admin commands require Administrator" })
        .setTimestamp(),
    ],
  });
}

export async function handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand(true);
  const cfg = getEffectiveConfig();

  if (sub === "view") {
    const onOff = (v: boolean) => (v ? "✅ On" : "❌ Off");
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚙️ Automod Configuration")
          .addFields(
            { name: "🚫 Spam Detection", value: `${onOff(cfg.spam.enabled)} — max **${cfg.spam.maxMessages}** msgs in **${cfg.spam.windowMs / 1000}s**`, inline: false },
            { name: "🤬 Bad Words", value: `${onOff(cfg.badWords.enabled)} — **${cfg.badWords.words.length}** words filtered`, inline: false },
            { name: "🔗 Invite Links", value: onOff(cfg.inviteLinks.enabled), inline: true },
            { name: "📣 Mass Mentions", value: `${onOff(cfg.massMention.enabled)} — max **${cfg.massMention.maxMentions}** pings`, inline: false },
            { name: "🔠 Caps Spam", value: `${onOff(cfg.capsSpam.enabled)} — **${cfg.capsSpam.maxCapsPercent}%** threshold`, inline: false },
            { name: "🌐 External Links", value: onOff(cfg.externalLinks.enabled), inline: true },
            { name: "📋 Log Channel", value: `\`${cfg.logChannel}\``, inline: false },
            { name: "📝 Bad Word List", value: cfg.badWords.words.map((w) => `\`${w}\``).join(", ") || "*(empty)*", inline: false },
          )
          .setFooter({ text: "Use /config toggle, /config badwords, etc. to make changes" })
          .setTimestamp(),
      ],
    });
    return;
  }

  if (sub === "toggle") {
    const feature = interaction.options.getString("feature", true) as
      "spam" | "badWords" | "inviteLinks" | "massMention" | "capsSpam" | "externalLinks";
    const enabled = interaction.options.getBoolean("enabled", true);
    saveConfigOverride({ [feature]: { enabled } });
    const label: Record<string, string> = {
      spam: "Spam Detection",
      badWords: "Bad Words",
      inviteLinks: "Invite Links",
      massMention: "Mass Mentions",
      capsSpam: "Caps Spam",
      externalLinks: "External Links",
    };
    await interaction.editReply({
      embeds: [successEmbed(`**${label[feature]}** is now **${enabled ? "enabled ✅" : "disabled ❌"}**.`)],
    });
    return;
  }

  if (sub === "badwords") {
    const action = interaction.options.getString("action", true) as "add" | "remove";
    const word = interaction.options.getString("word", true).toLowerCase().trim();
    const currentWords = [...cfg.badWords.words];

    if (action === "add") {
      if (currentWords.includes(word)) {
        await interaction.editReply({ embeds: [errorEmbed(`\`${word}\` is already in the bad word list.`)] });
        return;
      }
      currentWords.push(word);
      saveConfigOverride({ badWords: { words: currentWords } });
      await interaction.editReply({ embeds: [successEmbed(`Added \`${word}\` to the bad word list. (${currentWords.length} words total)`)] });
    } else {
      const idx = currentWords.indexOf(word);
      if (idx === -1) {
        await interaction.editReply({ embeds: [errorEmbed(`\`${word}\` was not found in the bad word list.`)] });
        return;
      }
      currentWords.splice(idx, 1);
      saveConfigOverride({ badWords: { words: currentWords } });
      await interaction.editReply({ embeds: [successEmbed(`Removed \`${word}\` from the bad word list. (${currentWords.length} words remaining)`)] });
    }
    return;
  }

  if (sub === "spam") {
    const threshold = interaction.options.getInteger("threshold");
    const window = interaction.options.getInteger("window");
    if (threshold === null && window === null) {
      await interaction.editReply({ embeds: [errorEmbed("Provide at least one of `threshold` or `window`.")] });
      return;
    }
    const patch: Record<string, number> = {};
    if (threshold !== null) patch["maxMessages"] = threshold;
    if (window !== null) patch["windowMs"] = window * 1000;
    saveConfigOverride({ spam: patch });
    const updated = getEffectiveConfig().spam;
    await interaction.editReply({
      embeds: [successEmbed(`Spam detection updated: max **${updated.maxMessages}** messages in **${updated.windowMs / 1000}s**`)],
    });
    return;
  }

  if (sub === "caps") {
    const threshold = interaction.options.getInteger("threshold", true);
    saveConfigOverride({ capsSpam: { maxCapsPercent: threshold } });
    await interaction.editReply({
      embeds: [successEmbed(`Caps-spam threshold set to **${threshold}%**`)],
    });
    return;
  }

  if (sub === "logchannel") {
    const channel = interaction.options.getChannel("channel", true);
    saveConfigOverride({ logChannel: channel.id });
    await interaction.editReply({
      embeds: [successEmbed(`Mod-log channel set to <#${channel.id}>.`)],
    });
    return;
  }

  await interaction.editReply({ embeds: [errorEmbed("Unknown subcommand.")] });
}

export async function handleReport(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const cfg = getEffectiveConfig();

  if (targetUser.id === interaction.user.id) {
    await interaction.editReply({ embeds: [errorEmbed("You cannot report yourself.")] });
    return;
  }

  const logChannel = interaction.guild!.channels.cache.find(
    (c) => c.id === cfg.logChannel || c.name === cfg.logChannel
  ) as TextChannel | undefined;

  if (!logChannel) {
    await interaction.editReply({ embeds: [errorEmbed("No mod-log channel configured. Ask an admin to run `/config logchannel`.")] });
    return;
  }

  await logChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🚨 Member Report")
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: "Reported User", value: `<@${targetUser.id}> \`${targetUser.tag}\``, inline: true },
          { name: "Reporter", value: `<@${interaction.user.id}> \`${interaction.user.tag}\``, inline: true },
          { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
          { name: "Reason", value: reason },
        )
        .setFooter({ text: "Use /warn, /timeout, or /ban to take action" })
        .setTimestamp(),
    ],
  });

  await interaction.editReply({
    embeds: [successEmbed("Your report has been submitted to the moderation team. Thank you for helping keep the server safe! 🙏")],
  });
}

export async function handleTicket(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const subject = interaction.options.getString("subject", true);

  const ticketChannel = (interaction.guild!.channels.cache.find(
    (c) => c.name === "tickets" || c.name === "support" || c.name === "support-tickets"
  ) as TextChannel | undefined) ?? (interaction.channel as TextChannel);

  try {
    const thread = await ticketChannel.threads.create({
      name: `🎫 ${interaction.user.username} — ${subject.slice(0, 48)}`,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Support ticket opened by ${interaction.user.tag}`,
    });

    await thread.members.add(interaction.user.id);

    await thread.send({
      content: `<@${interaction.user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎫 Support Ticket")
          .setDescription(
            `Welcome, <@${interaction.user.id}>! A staff member will be with you shortly.\n\n` +
            `**Subject:** ${subject}\n\n` +
            `Please describe your issue in as much detail as possible. ` +
            `Only you and the moderation team can see this thread.`
          )
          .setFooter({ text: "Staff: close this thread once resolved" })
          .setTimestamp(),
      ],
    });

    await interaction.editReply({
      embeds: [successEmbed(`Your ticket has been created! Head to ${thread} to continue. Only you and staff can see it.`)],
    });
  } catch (e) {
    await interaction.editReply({ embeds: [errorEmbed(`Failed to create ticket thread: ${e}`)] });
  }
}

export async function handleAppeal(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reason = interaction.options.getString("reason", true);
  const cfg = getEffectiveConfig();
  const record = getUserRecord(interaction.user.id);

  const logChannel = interaction.guild!.channels.cache.find(
    (c) => c.id === cfg.logChannel || c.name === cfg.logChannel
  ) as TextChannel | undefined;

  if (!logChannel) {
    await interaction.editReply({ embeds: [errorEmbed("No mod-log channel configured. Contact a staff member directly.")] });
    return;
  }

  const warningCount = record?.warnings ?? 0;
  const infractionCount = record?.infractions?.length ?? 0;

  await logChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("📬 Warning Appeal")
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "User", value: `<@${interaction.user.id}> \`${interaction.user.tag}\``, inline: true },
          { name: "Active Warnings", value: `${warningCount}`, inline: true },
          { name: "Total Infractions on Record", value: `${infractionCount}`, inline: true },
          { name: "Appeal Reason", value: reason },
        )
        .setFooter({ text: "Use /clearwarnings if the appeal is approved" })
        .setTimestamp(),
    ],
  });

  await interaction.editReply({
    embeds: [successEmbed("Your appeal has been submitted to the moderation team. Please be patient while staff review your case.")],
  });
}

export async function handleSetWelcome(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.options.getChannel("channel", true) as import("discord.js").TextChannel;

  saveWelcomeChannel(channel.id);

  const current = getWelcomeChannel();
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Welcome Channel Updated")
        .setDescription(
          `Welcome messages will now be posted in <#${channel.id}>.

` +
          `Whenever a new member joins the server, the bot will send a welcome embed there automatically.`
        )
        .addFields({ name: "Channel", value: `<#${current}>`, inline: true })
        .setFooter({ text: "Use /setwelcome again to change it at any time" })
        .setTimestamp(),
    ],
  });
}

export async function handleTestWelcome(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const member = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed("Could not find that member in this server.")] });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription("Here's a preview of the welcome message that will be posted when a new member joins:")
        .setFooter({ text: "This is only visible to you — no message was posted to the welcome channel." }),
    ],
  });

  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [welcomeEmbed(member)],
  });
}
