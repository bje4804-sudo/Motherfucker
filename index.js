require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const createdChannels = new Map();
const createdRoles = new Map();
const cancelFlags = new Map();

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const parseList = (str) => str.split(",").map((s) => s.trim()).filter(Boolean);

// ── Commands ──────────────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send messages to a channel or user")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Message(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many times (max 10000)").setRequired(true).setMinValue(1).setMaxValue(10000)
    )
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("Target channel (blank = current)").setRequired(false)
    )
    .addUserOption((opt) =>
      opt.setName("user").setDescription("DM a user instead").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("createchannels")
    .setDescription("Create up to 2500 channels")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("names").setDescription("Channel name(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many (max 2500)").setRequired(true).setMinValue(1).setMaxValue(2500)
    ),

  new SlashCommandBuilder()
    .setName("createroles")
    .setDescription("Create up to 2500 roles")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("names").setDescription("Role name(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many (max 2500)").setRequired(true).setMinValue(1).setMaxValue(2500)
    ),

  new SlashCommandBuilder()
    .setName("ultimate")
    .setDescription("Spam messages + create channels + create roles all at once")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("message").setDescription("Message(s) to spam — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("message_count").setDescription("How many messages (max 10000)").setRequired(true).setMinValue(1).setMaxValue(10000)
    )
    .addStringOption((opt) =>
      opt.setName("channel_names").setDescription("Channel name(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("channel_count").setDescription("How many channels (max 2500)").setRequired(true).setMinValue(1).setMaxValue(2500)
    )
    .addStringOption((opt) =>
      opt.setName("role_names").setDescription("Role name(s) — comma-separate for random picks").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("role_count").setDescription("How many roles (max 2500)").setRequired(true).setMinValue(1).setMaxValue(2500)
    )
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("Channel to spam messages in (blank = current)").setRequired(false)
    )
    .addUserOption((opt) =>
      opt.setName("user").setDescription("DM a user for messages instead").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("undo")
    .setDescription("Delete all channels and roles created by the last run")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild),

  new SlashCommandBuilder()
    .setName("cancel")
    .setDescription("Cancel any currently running command")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
].map((cmd) => cmd.toJSON());

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

// ── Helpers ───────────────────────────────────────────────────────────────────
async function runSend({ dest, dmChannel, messages, count, guildId }) {
  let sent = 0;
  for (let i = 0; i < count; i++) {
    if (cancelFlags.get(guildId)) break;
    try {
      if (dmChannel) await dmChannel.send(pick(messages));
      else await dest.send(pick(messages));
      sent++;
    } catch { break; }
  }
  return sent;
}

async function runCreateChannels({ guild, names, count, guildId }) {
  const ids = [];
  let created = 0, failed = 0;
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
    } catch { failed++; }
  }
  return { ids, created, failed };
}

async function runCreateRoles({ guild, names, count, guildId }) {
  const ids = [];
  let created = 0, failed = 0;
  for (let i = 1; i <= count; i++) {
    if (cancelFlags.get(guildId)) break;
    try {
      const name = names.length > 1 ? pick(names) : `${pick(names)} ${i}`;
      const role = await guild.roles.create({ name });
      ids.push(role.id);
      created++;
    } catch { roleFailed++; }
  }
  return { ids, created, failed };
}

// ── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guildId = interaction.guildId ?? interaction.user.id;

  // ── /cancel ──
  if (interaction.commandName === "cancel") {
    if (cancelFlags.has(guildId)) {
      cancelFlags.set(guildId, true);
      await interaction.reply({ content: "⛔ Cancel signal sent — stopping after current item.", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ Nothing is currently running.", ephemeral: true });
    }
    return;
  }

  // ── /send ──
  if (interaction.commandName === "send") {
    const messages = parseList(interaction.options.getString("message"));
    const count = interaction.options.getInteger("count");
    const targetChannel = interaction.options.getChannel("channel");
    const targetUser = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    let dmChannel = null;

    if (targetUser) {
      try { dmChannel = await targetUser.createDM(); }
      catch { await interaction.editReply(`❌ Couldn't DM ${targetUser.tag}.`); cancelFlags.delete(guildId); return; }
    } else if (!interaction.guild) {
      // Already in a DM context — send to this channel
      try { dmChannel = interaction.channel ?? await interaction.user.createDM(); }
      catch { await interaction.editReply("❌ Couldn't open DM channel."); cancelFlags.delete(guildId); return; }
    }

    const dest = targetChannel ?? interaction.channel;
    const sent = await runSend({ dest, dmChannel, messages, count, guildId });
    cancelFlags.delete(guildId);
    await interaction.editReply(`✅ Sent **${sent}** message(s).${sent < count ? " *(cancelled)*" : ""}`);
  }

  // ── /createchannels ──
  if (interaction.commandName === "createchannels") {
    const names = parseList(interaction.options.getString("names"));
    const count = interaction.options.getInteger("count");
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const { ids, created, failed } = await runCreateChannels({ guild, names, count, guildId });
    createdChannels.set(guild.id, ids);
    cancelFlags.delete(guildId);

    await interaction.editReply(
      `✅ Created **${created}** channels.${failed > 0 ? ` (${failed} failed)` : ""}${created < count ? " *(cancelled)*" : ""}\nRun \`/undo\` to delete.`
    );
  }

  // ── /createroles ──
  if (interaction.commandName === "createroles") {
    const names = parseList(interaction.options.getString("names"));
    const count = interaction.options.getInteger("count");
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const { ids, created, failed } = await runCreateRoles({ guild, names, count, guildId });
    createdRoles.set(guild.id, ids);
    cancelFlags.delete(guildId);

    await interaction.editReply(
      `✅ Created **${created}** roles.${failed > 0 ? ` (${failed} failed)` : ""}${created < count ? " *(cancelled)*" : ""}\nRun \`/undo\` to delete.`
    );
  }

  // ── /ultimate ──
  if (interaction.commandName === "ultimate") {
    const messages = parseList(interaction.options.getString("message"));
    const msgCount = interaction.options.getInteger("message_count");
    const channelNames = parseList(interaction.options.getString("channel_names"));
    const channelCount = interaction.options.getInteger("channel_count");
    const roleNames = parseList(interaction.options.getString("role_names"));
    const roleCount = interaction.options.getInteger("role_count");
    const targetChannel = interaction.options.getChannel("channel");
    const targetUser = interaction.options.getUser("user");
    const guild = interaction.guild;

    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    let dmChannel = null;
    if (targetUser) {
      try { dmChannel = await targetUser.createDM(); } catch {}
    }
    const dest = targetChannel ?? interaction.channel;

    const [sent, chResult, roleResult] = await Promise.all([
      runSend({ dest, dmChannel, messages, count: msgCount, guildId }),
      runCreateChannels({ guild, names: channelNames, count: channelCount, guildId }),
      runCreateRoles({ guild, names: roleNames, count: roleCount, guildId }),
    ]);

    createdChannels.set(guild.id, chResult.ids);
    createdRoles.set(guild.id, roleResult.ids);
    cancelFlags.delete(guildId);

    const cancelled = sent < msgCount || chResult.created < channelCount || roleResult.created < roleCount;

    await interaction.editReply(
      `💥 **Ultimate complete${cancelled ? " (cancelled)" : ""}:**\n` +
      `📨 Messages sent: **${sent}**\n` +
      `📁 Channels created: **${chResult.created}**${chResult.failed > 0 ? ` (${chResult.failed} failed)` : ""}\n` +
      `🎭 Roles created: **${roleResult.created}**${roleResult.failed > 0 ? ` (${roleResult.failed} failed)` : ""}\n\n` +
      `Run \`/undo\` to delete all created channels and roles.`
    );
  }

  // ── /undo ──
  if (interaction.commandName === "undo") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    const chIds = createdChannels.get(guild.id) ?? [];
    const roleIds = createdRoles.get(guild.id) ?? [];

    if (chIds.length === 0 && roleIds.length === 0) {
      await interaction.reply({ content: "❌ Nothing to undo this session.", ephemeral: true });
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
