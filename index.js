require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Track created channels/roles per guild for undo
const createdChannels = new Map();
const createdRoles = new Map();

// Cancellation flags per guild
const cancelFlags = new Map();

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const parseList = (str) => str.split(",").map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Register slash commands ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send messages to a channel or user")
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Message(s) to send — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many times to send (max 10000)").setRequired(true).setMinValue(1).setMaxValue(10000)
    )
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("Target channel (leave blank for current)").setRequired(false)
    )
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Target user to DM instead").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("createchannels")
    .setDescription("Create up to 2500 channels with random names from a comma-separated list")
    .addStringOption((opt) =>
      opt.setName("names").setDescription("Channel name(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many channels to create (max 2500)").setRequired(true).setMinValue(1).setMaxValue(2500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("createroles")
    .setDescription("Create up to 2500 roles with random names from a comma-separated list")
    .addStringOption((opt) =>
      opt.setName("names").setDescription("Role name(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many roles to create (max 2500)").setRequired(true).setMinValue(1).setMaxValue(2500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("undo")
    .setDescription("Delete all channels AND roles created by the last run")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("cancel")
    .setDescription("Cancel any currently running /send, /createchannels, or /createroles command")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((cmd) => cmd.toJSON());

// Register commands on ready
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    console.log("⏳ Registering slash commands...");
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered globally.");
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
});

// ── Handle interactions ───────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guildId = interaction.guildId ?? "dm";

  // ── /cancel ──
  if (interaction.commandName === "cancel") {
    if (cancelFlags.get(guildId)) {
      cancelFlags.set(guildId, true);
      await interaction.reply({ content: "⛔ Cancel signal sent — stopping after current item.", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ Nothing is currently running.", ephemeral: true });
    }
    return;
  }

  // ── /send ──
  if (interaction.commandName === "send") {
    const raw = interaction.options.getString("message");
    const count = interaction.options.getInteger("count");
    const targetChannel = interaction.options.getChannel("channel");
    const targetUser = interaction.options.getUser("user");
    const messages = parseList(raw);

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    if (targetUser) {
      try {
        const dmChannel = await targetUser.createDM();
        let sent = 0;
        for (let i = 0; i < count; i++) {
          if (cancelFlags.get(guildId)) break;
          await dmChannel.send(pick(messages));
          sent++;
        }
        await interaction.editReply(`✅ Sent ${sent} message(s) to ${targetUser.tag} via DM.${sent < count ? " *(cancelled)*" : ""}`);
      } catch {
        await interaction.editReply(`❌ Couldn't DM ${targetUser.tag} — they may have DMs disabled.`);
      }
      cancelFlags.delete(guildId);
      return;
    }

    const dest = targetChannel ?? interaction.channel;
    if (!dest.isTextBased()) {
      await interaction.editReply("❌ That channel isn't a text channel.");
      return;
    }

    try {
      let sent = 0;
      for (let i = 0; i < count; i++) {
        if (cancelFlags.get(guildId)) break;
        await dest.send(pick(messages));
        sent++;
      }
      await interaction.editReply(`✅ Sent ${sent} message(s) to ${dest}.${sent < count ? " *(cancelled)*" : ""}`);
    } catch {
      await interaction.editReply(`❌ Couldn't send to ${dest} — missing permissions?`);
    }
    cancelFlags.delete(guildId);
  }

  // ── /createchannels ──
  if (interaction.commandName === "createchannels") {
    const raw = interaction.options.getString("names");
    const count = interaction.options.getInteger("count");
    const guild = interaction.guild;
    const names = parseList(raw);

    if (!guild) {
      await interaction.reply({ content: "❌ This command only works in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const ids = [];
    let created = 0;
    let failed = 0;

    for (let i = 1; i <= count; i++) {
      if (cancelFlags.get(guildId)) break;
      try {
        const base = pick(names).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90);
        const ch = await guild.channels.create({
          name: names.length > 1 ? base : `${base}-${i}`,
          type: ChannelType.GuildText,
        });
        ids.push(ch.id);
        created++;
      } catch {
        failed++;
      }
    }

    createdChannels.set(guild.id, ids);
    cancelFlags.delete(guildId);

    await interaction.editReply(
      `✅ Created **${created}** channels.${failed > 0 ? ` (${failed} failed)` : ""}${created < count ? " *(cancelled)*" : ""}\nRun \`/undo\` to delete them all.`
    );
  }

  // ── /createroles ──
  if (interaction.commandName === "createroles") {
    const raw = interaction.options.getString("names");
    const count = interaction.options.getInteger("count");
    const guild = interaction.guild;
    const names = parseList(raw);

    if (!guild) {
      await interaction.reply({ content: "❌ This command only works in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const ids = [];
    let created = 0;
    let failed = 0;

    for (let i = 1; i <= count; i++) {
      if (cancelFlags.get(guildId)) break;
      try {
        const name = names.length > 1 ? pick(names) : `${pick(names)} ${i}`;
        const role = await guild.roles.create({ name });
        ids.push(role.id);
        created++;
      } catch {
        failed++;
      }
    }

    createdRoles.set(guild.id, ids);
    cancelFlags.delete(guildId);

    await interaction.editReply(
      `✅ Created **${created}** roles.${failed > 0 ? ` (${failed} failed)` : ""}${created < count ? " *(cancelled)*" : ""}\nRun \`/undo\` to delete them all.`
    );
  }

  // ── /undo ──
  if (interaction.commandName === "undo") {
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: "❌ This command only works in a server.", ephemeral: true });
      return;
    }

    const chIds = createdChannels.get(guild.id) ?? [];
    const roleIds = createdRoles.get(guild.id) ?? [];

    if (chIds.length === 0 && roleIds.length === 0) {
      await interaction.reply({ content: "❌ Nothing to undo — no channels or roles were created this session.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let chDeleted = 0, chFailed = 0;
    for (const id of chIds) {
      try {
        const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
        if (ch) { await ch.delete(); chDeleted++; }
      } catch { chFailed++; }
    }

    let roleDeleted = 0, roleFailed = 0;
    for (const id of roleIds) {
      try {
        const role = guild.roles.cache.get(id) ?? await guild.roles.fetch(id).catch(() => null);
        if (role) { await role.delete(); roleDeleted++; }
      } catch { roleFailed++; }
    }

    createdChannels.delete(guild.id);
    createdRoles.delete(guild.id);

    const parts = [];
    if (chDeleted > 0) parts.push(`**${chDeleted}** channels`);
    if (roleDeleted > 0) parts.push(`**${roleDeleted}** roles`);
    const failures = chFailed + roleFailed;

    await interaction.editReply(
      `✅ Deleted ${parts.join(" and ")}.${failures > 0 ? ` (${failures} couldn't be deleted)` : ""}`
    );
  }
});

client.login(process.env.BOT_TOKEN);
