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

// Track created channels per guild for undo: guildId -> [channelId, ...]
const createdChannels = new Map();

// ── Register slash commands ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send a custom message multiple times to a channel or user")
    .addStringOption((opt) =>
      opt.setName("message").setDescription("The message to send").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("How many times to send it (max 2500)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(2500)
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
    .setDescription("Create up to 2500 channels with a given name")
    .addStringOption((opt) =>
      opt.setName("name").setDescription("The channel name (numbers will be appended)").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("How many channels to create (max 2500)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(2500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("undo")
    .setDescription("Delete all channels created by the last /createchannels command")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
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

  // ── /send ──
  if (interaction.commandName === "send") {
    const message = interaction.options.getString("message");
    const count = interaction.options.getInteger("count");
    const targetChannel = interaction.options.getChannel("channel");
    const targetUser = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: true });

    if (targetUser) {
      try {
        const dmChannel = await targetUser.createDM();
        for (let i = 0; i < count; i++) await dmChannel.send(message);
        await interaction.editReply(`✅ Sent **"${message}"** × ${count} to ${targetUser.tag} via DM.`);
      } catch {
        await interaction.editReply(`❌ Couldn't DM ${targetUser.tag} — they may have DMs disabled.`);
      }
      return;
    }

    const dest = targetChannel ?? interaction.channel;
    if (!dest.isTextBased()) {
      await interaction.editReply("❌ That channel isn't a text channel.");
      return;
    }

    try {
      for (let i = 0; i < count; i++) await dest.send(message);
      await interaction.editReply(`✅ Sent **"${message}"** × ${count} to ${dest}.`);
    } catch {
      await interaction.editReply(`❌ Couldn't send to ${dest} — missing permissions?`);
    }
  }

  // ── /createchannels ──
  if (interaction.commandName === "createchannels") {
    const name = interaction.options.getString("name");
    const count = interaction.options.getInteger("count");
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: "❌ This command only works in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const ids = [];
    let created = 0;
    let failed = 0;

    for (let i = 1; i <= count; i++) {
      try {
        const ch = await guild.channels.create({
          name: `${name}-${i}`,
          type: ChannelType.GuildText,
        });
        ids.push(ch.id);
        created++;
      } catch {
        failed++;
      }
    }

    // Store for undo
    createdChannels.set(guild.id, ids);

    await interaction.editReply(
      `✅ Created **${created}** channels named \`${name}-1\` → \`${name}-${created}\`${failed > 0 ? ` (${failed} failed)` : ""}.\nRun \`/undo\` to delete them all.`
    );
  }

  // ── /undo ──
  if (interaction.commandName === "undo") {
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: "❌ This command only works in a server.", ephemeral: true });
      return;
    }

    const ids = createdChannels.get(guild.id);

    if (!ids || ids.length === 0) {
      await interaction.reply({ content: "❌ Nothing to undo — no channels were created this session.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let deleted = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
        if (ch) {
          await ch.delete();
          deleted++;
        }
      } catch {
        failed++;
      }
    }

    createdChannels.delete(guild.id);

    await interaction.editReply(
      `✅ Deleted **${deleted}** channels.${failed > 0 ? ` (${failed} couldn't be deleted)` : ""}`
    );
  }
});

client.login(process.env.BOT_TOKEN);
