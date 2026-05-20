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
  MessageFlags,
  type GuildMember,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js";
import { commands } from "./commands";
import { welcomeEmbed } from "./embeds";
import { handleAutoMod } from "./automod";
import { getWelcomeChannel } from "./database";
import {
  handleWarn, handleTimeout, handleUntimeout, handleKick,
  handleBan, handleUnban, handleClearWarnings, handleInfractions,
  handlePurge, handleAnnounce, handleSlowmode, handleLock,
  handleUnlock, handleRole, handleServerInfo, handleUserInfo, handleHelp,
  handleSetupRules, handleConfig, handleReport, handleTicket, handleAppeal,
  handleSetWelcome, handleTestWelcome,
} from "./handlers";

const TOKEN = process.env["DISCORD_BOT_TOKEN"];
const GUILD_ID = process.env["DISCORD_GUILD_ID"];
const DEFAULT_WELCOME_CHANNEL = process.env["DISCORD_WELCOME_CHANNEL"] ?? "welcome";

if (!TOKEN) throw new Error("Missing DISCORD_BOT_TOKEN environment variable");
if (!GUILD_ID) throw new Error("Missing DISCORD_GUILD_ID environment variable");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

// Prevent unhandled 'error' events from crashing the process
client.on(Events.Error, (err) => {
  console.error("Discord client error:", err);
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

client.on(Events.MessageCreate, async (message) => {
  await handleAutoMod(message).catch((err) =>
    console.error("Auto-mod error:", err)
  );
});

client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
  try {
    // Prefer the channel saved via /setwelcome, fall back to the env var
    const savedChannelId = getWelcomeChannel();
    const channelQuery = savedChannelId ?? DEFAULT_WELCOME_CHANNEL;

    const channel = member.guild.channels.cache.find(
      (c) => c.id === channelQuery || c.name === channelQuery
    ) as TextChannel | undefined;

    if (!channel) {
      console.warn(`Welcome channel "${channelQuery}" not found`);
      return;
    }

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
      config: handleConfig,
      report: handleReport,
      ticket: handleTicket,
      appeal: handleAppeal,
      setwelcome: handleSetWelcome,
      testwelcome: handleTestWelcome,
    };

    const handler = handlers[commandName];
    if (handler) {
      await handler(interaction as ChatInputCommandInteraction);
    } else {
      await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error(`Error handling /${commandName}:`, err);
    const errMsg: InteractionReplyOptions = {
      content: "An error occurred while running that command.",
      flags: MessageFlags.Ephemeral,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errMsg);
      } else {
        await interaction.reply(errMsg);
      }
    } catch {
      // Interaction token expired — nothing we can do
    }
  }
});

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
  client.login(TOKEN).catch((err) => {
    console.error("Failed to login to Discord:", err);
    process.exit(1);
  });
});
