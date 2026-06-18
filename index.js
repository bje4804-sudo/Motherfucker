require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ── Register slash commands ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send a custom message multiple times to a channel or user")
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("The message to send")
        .setRequired(true)
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
      opt
        .setName("channel")
        .setDescription("Target channel (leave blank to use current channel)")
        .setRequired(false)
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Target user to DM instead")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((cmd) => cmd.toJSON());

// Register commands on ready
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    console.log("⏳ Registering slash commands...");
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("✅ Slash commands registered globally.");
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
});

// ── Handle /send ─────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "send") return;

  const message = interaction.options.getString("message");
  const count = interaction.options.getInteger("count");
  const targetChannel = interaction.options.getChannel("channel");
  const targetUser = interaction.options.getUser("user");

  await interaction.deferReply({ ephemeral: true });

  // DM mode
  if (targetUser) {
    try {
      const dmChannel = await targetUser.createDM();
      for (let i = 0; i < count; i++) {
        await dmChannel.send(message);
      }
      await interaction.editReply(
        `✅ Sent **"${message}"** × ${count} to ${targetUser.tag} via DM.`
      );
    } catch (err) {
      await interaction.editReply(
        `❌ Couldn't DM ${targetUser.tag} — they may have DMs disabled.`
      );
    }
    return;
  }

  // Channel mode
  const dest = targetChannel ?? interaction.channel;

  // Make sure it's a text-based channel
  if (!dest.isTextBased()) {
    await interaction.editReply("❌ That channel isn't a text channel.");
    return;
  }

  try {
    for (let i = 0; i < count; i++) {
      await dest.send(message);
    }
    await interaction.editReply(
      `✅ Sent **"${message}"** × ${count} to ${dest}.`
    );
  } catch (err) {
    await interaction.editReply(
      `❌ Couldn't send to ${dest} — missing permissions?`
    );
  }
});

client.login(process.env.BOT_TOKEN);
