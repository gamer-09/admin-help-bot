import {
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { addInfraction, getUserRecord, clearWarnings, getUser } from "./database";
import {
  warningEmbed, timeoutEmbed, kickEmbed, infractionListEmbed,
  errorEmbed, successEmbed, serverStatsEmbed,
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
  await interaction.deferReply({ ephemeral: true });
  const targetUser = interaction.options.getUser("user", true);
  const cleared = clearWarnings(targetUser.id);
  await interaction.editReply({ embeds: [cleared
    ? successEmbed(`All warnings cleared for ${targetUser.tag}.`)
    : errorEmbed(`No record found for ${targetUser.tag}.`)] });
}

export async function handleInfractions(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.deferReply({ ephemeral: true });
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
  await interaction.deferReply({ ephemeral: true });
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

export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🤖 Bot Commands")
      .addFields(
        { name: "⚠️ Progressive Discipline (/warn)", value: "1st → Warning\n2nd → 10-min Timeout\n3rd → Final Warning\n4th → Permanent Ban" },
        { name: "🔨 Moderation", value: "`/timeout` `/untimeout` `/kick` `/ban` `/unban`" },
        { name: "📋 Records", value: "`/infractions` `/clearwarnings`" },
        { name: "🛠️ Admin Tools", value: "`/purge` `/slowmode` `/lock` `/unlock` `/role` `/announce`" },
        { name: "ℹ️ Info", value: "`/serverinfo` `/userinfo` `/help`" },
        { name: "🎉 Auto Features", value: "Welcome message posted in #welcome when a new member joins." }
      )
      .setFooter({ text: "All mod commands require appropriate Discord permissions." })
      .setTimestamp()],
  });
}
