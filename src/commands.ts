import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user (auto-escalates: warn → timeout → final warning → ban)")
    .addUserOption((o) => o.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Manually timeout a user")
    .addUserOption((o) => o.setName("user").setDescription("User to timeout").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("duration").setDescription("Duration in minutes (default: 10)").setMinValue(1).setMaxValue(40320)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a user")
    .addUserOption((o) => o.setName("user").setDescription("User to untimeout").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((o) => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("delete_days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by their ID")
    .addStringOption((o) => o.setName("userid").setDescription("User ID to unban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear all warnings for a user")
    .addUserOption((o) => o.setName("user").setDescription("User to clear warnings for").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("infractions")
    .setDescription("View infraction history for a user")
    .addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages in bulk")
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("Number of messages to delete (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user (optional)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement to a channel")
    .addStringOption((o) => o.setName("message").setDescription("The announcement text").setRequired(true))
    .addStringOption((o) => o.setName("title").setDescription("Announcement title (optional)"))
    .addChannelOption((o) => o.setName("channel").setDescription("Target channel (default: current)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode on a channel")
    .addIntegerOption((o) =>
      o.setName("seconds").setDescription("Delay in seconds (0 to disable)").setRequired(true).setMinValue(0).setMaxValue(21600)
    )
    .addChannelOption((o) => o.setName("channel").setDescription("Target channel (default: current)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel")
    .addStringOption((o) => o.setName("reason").setDescription("Reason for locking"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a user")
    .addStringOption((o) =>
      o.setName("action").setDescription("add or remove").setRequired(true)
        .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
    )
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to add/remove").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display server statistics"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Display information about a user")
    .addUserOption((o) => o.setName("user").setDescription("User to inspect (default: yourself)")),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all available bot commands"),

  new SlashCommandBuilder()
    .setName("setuprules")
    .setDescription("Post the server rules embed into the rules channel")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to post rules in (default: #rules)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a user to the moderation team")
    .addUserOption((o) => o.setName("user").setDescription("User to report").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the report").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a private support ticket with the moderation team")
    .addStringOption((o) => o.setName("subject").setDescription("Brief subject of your issue").setRequired(true)),

  new SlashCommandBuilder()
    .setName("appeal")
    .setDescription("Appeal a warning or punishment to the moderation team")
    .addStringOption((o) => o.setName("reason").setDescription("Explain why you believe the action should be reversed").setRequired(true)),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("View or adjust automod configuration")
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("Show current automod settings")
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable an automod feature")
        .addStringOption((o) =>
          o.setName("feature").setDescription("Feature to toggle").setRequired(true)
            .addChoices(
              { name: "spam", value: "spam" },
              { name: "bad-words", value: "badWords" },
              { name: "invite-links", value: "inviteLinks" },
              { name: "mass-mention", value: "massMention" },
              { name: "caps-spam", value: "capsSpam" },
              { name: "external-links", value: "externalLinks" },
            )
        )
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Turn on or off").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("badwords")
        .setDescription("Add or remove a word from the bad word filter")
        .addStringOption((o) =>
          o.setName("action").setDescription("add or remove").setRequired(true)
            .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
        )
        .addStringOption((o) =>
          o.setName("word").setDescription("The word to add or remove").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("spam")
        .setDescription("Adjust spam detection thresholds")
        .addIntegerOption((o) =>
          o.setName("threshold").setDescription("Max messages in window before action (default: 5)").setMinValue(2).setMaxValue(30)
        )
        .addIntegerOption((o) =>
          o.setName("window").setDescription("Time window in seconds (default: 5)").setMinValue(1).setMaxValue(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("caps")
        .setDescription("Adjust the caps-spam percentage threshold")
        .addIntegerOption((o) =>
          o.setName("threshold").setDescription("Minimum % uppercase to trigger (default: 70)").setRequired(true).setMinValue(10).setMaxValue(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("logchannel")
        .setDescription("Set the channel where automod actions are logged")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("The log channel").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set the channel where welcome messages are posted when new members join")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("The welcome channel").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("testwelcome")
    .setDescription("Preview the welcome message as if you just joined the server")
    .addUserOption((o) =>
      o.setName("user").setDescription("Member to use as the preview subject (default: yourself)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());
