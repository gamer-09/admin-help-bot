import express from "express";
import {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  REST,
  Routes,
  TextChannel,
  Partials,
  type GuildMember,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commands } from "./commands";
import { welcomeEmbed } from "./embeds";
import { handleAutoMod } from "./automod";
import {
  handleWarn, handleTimeout, handleUntimeout, handleKick,
  handleBan, handleUnban, handleClearWarnings, handleInfractions,
  handlePurge, handleAnnounce, handleSlowmode, handleLock,
  handleUnlock, handleRole, handleServerInfo, handleUserInfo, handleHelp,
  handleSetupRules,
} from "./handlers";

const TOKEN = process.env["DISCORD_BOT_TOKEN"];
const GUILD_ID = process.env["DISCORD_GUILD_ID"];
const WELCOME_CHANNEL = process.env["DISCORD_WELCOME_CHANNEL"] ?? "welcome";

if (!TOKEN) throw new Error("Missing DISCORD_BOT_TOKEN environment variable");
if (!GUILD_ID) throw new Error("Missing DISCORD_GUILD_ID environment variable");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent, // Privileged — must be enabled in Dev Portal
  ],
  partials: [Partials.GuildMember],
});

async function registerCommands(appId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(TOKEN!);
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID!), { body: commands });
    console.log(`✅ Registered ${commands.length} slash commands`);
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  readyClient.user.setActivity("the server", { type: ActivityType.Watching });
  await registerCommands(readyClient.user.id);
});

// Auto-mod: watch every message for rule violations
client.on(Events.MessageCreate, async (message) => {
  await handleAutoMod(message).catch((err) =>
    console.error("Auto-mod error:", err)
  );
});

client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
  try {
    const channel = member.guild.channels.cache.find(
      (c) => c.name === WELCOME_CHANNEL || c.id === WELCOME_CHANNEL
    ) as TextChannel | undefined;
    if (!channel) { console.warn(`Welcome channel "${WELCOME_CHANNEL}" not found`); return; }
    await channel.send({ embeds: [welcomeEmbed(member)] });
    console.log(`Welcome message sent for ${member.user.tag}`);
  } catch (err) {
    console.error("Failed to send welcome message:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  console.log(`Command: /${commandName} by ${interaction.user.tag}`);

  try {
    const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
      warn: handleWarn,
      timeout: handleTimeout,
      untimeout: handleUntimeout,
      kick: handleKick,
      ban: handleBan,
      unban: handleUnban,
      clearwarnings: handleClearWarnings,
      infractions: handleInfractions,
      purge: handlePurge,
      announce: handleAnnounce,
      slowmode: handleSlowmode,
      lock: handleLock,
      unlock: handleUnlock,
      role: handleRole,
      serverinfo: handleServerInfo,
      userinfo: handleUserInfo,
      help: handleHelp,
      setuprules: handleSetupRules,
    };

    const handler = handlers[commandName];
    if (handler) {
      await handler(interaction as ChatInputCommandInteraction);
    } else {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
    }
  } catch (err) {
    console.error(`Error handling /${commandName}:`, err);
    const errMsg = { content: "An error occurred while running that command.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errMsg);
    } else {
      await interaction.reply(errMsg);
    }
  }
});

// Express HTTP server — Render requires binding to process.env.PORT on 0.0.0.0
const app = express();
const PORT = process.env["PORT"] || 10000;

app.get("/", (_req, res) => {
  res.send("Admin Help Bot is running.");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", bot: client.isReady() ? "online" : "connecting" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);

  // Start Discord bot after HTTP server is confirmed bound
  client.login(TOKEN).catch((err) => {
    console.error("Failed to login to Discord:", err);
    process.exit(1);
  });
});
