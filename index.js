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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const createdChannels = new Map();
const createdRoles = new Map();
const cancelFlags = new Map();
const echoTargets = new Map(); // guildId -> { userId: string|null, times: number }

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
    )
    .addStringOption((opt) =>
      opt.setName("channel_name").setDescription('Type "all" to send in every channel').setRequired(false)
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

  new SlashCommandBuilder()
    .setName("nukechannels")
    .setDescription("Delete ALL channels in the server (keeps the current one)")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename the server")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("name").setDescription("New server name").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("deleteall")
    .setDescription("Delete every channel, message, and role in the server")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Delete all channels and recreate them with random names")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("names").setDescription("Channel name(s) for recreation — comma-separate for random picks").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("massnick")
    .setDescription("Set everyone's nickname to the same thing")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("nickname").setDescription("The nickname to set for everyone").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  new SlashCommandBuilder()
    .setName("rolepurge")
    .setDescription("Strip all roles from all members")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete X messages in the current channel")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Number of messages to delete (max 100)").setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode on the current channel")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((opt) =>
      opt.setName("seconds").setDescription("Slowmode in seconds (0 to disable)").setRequired(true).setMinValue(0).setMaxValue(21600)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel so no one can type")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Repeat everyone's messages (or a specific user's) 5 times")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Only echo this user (blank = everyone)").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("times").setDescription("How many times to echo each message (default 5)").setRequired(false).setMinValue(1).setMaxValue(20)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("echooff")
    .setDescription("Stop echoing messages")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Post a quick yes/no poll")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("question").setDescription("The poll question").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("countdown")
    .setDescription("Post a countdown from X to 0")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((opt) =>
      opt.setName("from").setDescription("Count down from this number (max 100)").setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
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
  let consecutive_fails = 0;
  for (let i = 0; i < count; i++) {
    if (cancelFlags.get(guildId)) break;
    try {
      if (dmChannel) await dmChannel.send(pick(messages));
      else await dest.send(pick(messages));
      sent++;
      consecutive_fails = 0;
    } catch (err) {
      consecutive_fails++;
      console.error('Send error:', err?.message);
      if (consecutive_fails >= 5) break; // only stop after 5 consecutive failures
    }
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
    const channelName = interaction.options.getString("channel_name");
    const targetUser = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    // "all" mode — send to every text channel in the server
    if (channelName?.toLowerCase() === "all" && interaction.guild) {
      const textChannels = [...interaction.guild.channels.cache.values()].filter(ch => ch.isTextBased());
      let totalSent = 0;
      for (const ch of textChannels) {
        if (cancelFlags.get(guildId)) break;
        totalSent += await runSend({ dest: ch, dmChannel: null, messages, count, guildId });
      }
      cancelFlags.delete(guildId);
      await interaction.editReply(`✅ Sent **${totalSent}** total message(s) across **${textChannels.length}** channels.${cancelFlags.get(guildId) ? " *(cancelled)*" : ""}`);
      return;
    }

    let dmChannel = null;
    let dest = null;

    if (targetUser) {
      try { dmChannel = await targetUser.createDM(); }
      catch { await interaction.editReply(`❌ Couldn't DM ${targetUser.tag}.`); cancelFlags.delete(guildId); return; }
    } else if (targetChannel) {
      dest = targetChannel;
    } else if (interaction.channel) {
      dest = interaction.channel;
    } else {
      await interaction.editReply("❌ Specify a **user** to DM using the `user` option.");
      cancelFlags.delete(guildId);
      return;
    }

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

  // ── /nuke ──
  if (interaction.commandName === "nuke") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    const names = parseList(interaction.options.getString("names"));
    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const oldChannels = [...guild.channels.cache.values()];
    const count = oldChannels.length;
    let deleted = 0, created = 0;

    for (const ch of oldChannels) {
      if (cancelFlags.get(guildId)) break;
      try { await ch.delete(); deleted++; } catch {}
    }

    for (let i = 0; i < count; i++) {
      if (cancelFlags.get(guildId)) break;
      try {
        const base = pick(names).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90);
        await guild.channels.create({ name: names.length > 1 ? base : `${base}-${i+1}`, type: ChannelType.GuildText });
        created++;
      } catch {}
    }

    cancelFlags.delete(guildId);
    await interaction.editReply(`💥 Nuked **${deleted}** channels and recreated **${created}** with random names.`);
  }

  // ── /massnick ──
  if (interaction.commandName === "massnick") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    const nickname = interaction.options.getString("nickname");
    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const members = await guild.members.fetch();
    let done = 0, failed = 0;
    for (const [, member] of members) {
      if (cancelFlags.get(guildId)) break;
      if (member.user.bot) continue;
      try { await member.setNickname(nickname); done++; } catch { failed++; }
    }

    cancelFlags.delete(guildId);
    await interaction.editReply(`✅ Set nickname to **${nickname}** for **${done}** members.${failed > 0 ? ` (${failed} failed)` : ""}`);
  }

  // ── /rolepurge ──
  if (interaction.commandName === "rolepurge") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const members = await guild.members.fetch();
    let done = 0, failed = 0;
    for (const [, member] of members) {
      if (cancelFlags.get(guildId)) break;
      if (member.user.bot) continue;
      const roles = member.roles.cache.filter(r => r.name !== "@everyone");
      try { await member.roles.remove(roles); done++; } catch { failed++; }
    }

    cancelFlags.delete(guildId);
    await interaction.editReply(`✅ Stripped roles from **${done}** members.${failed > 0 ? ` (${failed} failed)` : ""}`);
  }

  // ── /purge ──
  if (interaction.commandName === "purge") {
    const count = interaction.options.getInteger("count");
    if (!interaction.channel) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    try {
      const fetched = await interaction.channel.messages.fetch({ limit: count });
      await interaction.channel.bulkDelete(fetched, true);
      await interaction.editReply(`✅ Deleted **${fetched.size}** messages.`);
    } catch {
      await interaction.editReply("❌ Couldn't delete messages — they may be older than 14 days.");
    }
  }

  // ── /slowmode ──
  if (interaction.commandName === "slowmode") {
    const seconds = interaction.options.getInteger("seconds");
    if (!interaction.channel) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.reply({ content: seconds === 0 ? "✅ Slowmode disabled." : `✅ Slowmode set to **${seconds}s**.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ Couldn't set slowmode.", ephemeral: true });
    }
  }

  // ── /lock ──
  if (interaction.commandName === "lock") {
    const guild = interaction.guild;
    if (!guild || !interaction.channel) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    try {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: "🔒 Channel locked.", ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ Couldn't lock channel.", ephemeral: true });
    }
  }

  // ── /unlock ──
  if (interaction.commandName === "unlock") {
    const guild = interaction.guild;
    if (!guild || !interaction.channel) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    try {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: "🔓 Channel unlocked.", ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ Couldn't unlock channel.", ephemeral: true });
    }
  }

  // ── /echo ──
  if (interaction.commandName === "echo") {
    const targetUser = interaction.options.getUser("user");
    const times = interaction.options.getInteger("times") ?? 5;
    echoTargets.set(guildId, { userId: targetUser?.id ?? null, times });
    await interaction.reply({ content: `✅ Echo **on** — repeating ${targetUser ? `<@${targetUser.id}>'s` : "everyone's"} messages **${times}×**. Use \`/echooff\` to stop.`, ephemeral: true });
  }

  // ── /echooff ──
  if (interaction.commandName === "echooff") {
    echoTargets.delete(guildId);
    await interaction.reply({ content: "✅ Echo **off**.", ephemeral: true });
  }

  // ── /poll ──
  if (interaction.commandName === "poll") {
    const question = interaction.options.getString("question");
    if (!interaction.channel) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    const msg = await interaction.channel.send(`📊 **Poll:** ${question}

✅ Yes  |  ❌ No`);
    await msg.react("✅");
    await msg.react("❌");
    await interaction.editReply("✅ Poll posted!");
  }

  // ── /countdown ──
  if (interaction.commandName === "countdown") {
    const from = interaction.options.getInteger("from");
    if (!interaction.channel) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);
    for (let i = from; i >= 0; i--) {
      if (cancelFlags.get(guildId)) break;
      await interaction.channel.send(i === 0 ? "🎉 **0 — GO!**" : `**${i}**`);
      if (i > 0) await new Promise(r => setTimeout(r, 1000));
    }
    cancelFlags.delete(guildId);
    await interaction.editReply("✅ Countdown done!");
  }

  // ── /deleteall ──
  if (interaction.commandName === "deleteall") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    let chDeleted = 0, chFailed = 0;
    let roleDeleted = 0, roleFailed = 0;

    // Delete all channels except current
    const channels = [...guild.channels.cache.values()].filter(ch => ch.id !== interaction.channelId);
    for (const ch of channels) {
      if (cancelFlags.get(guildId)) break;
      try { await ch.delete(); chDeleted++; }
      catch { chFailed++; }
    }

    // Delete all non-default roles (can't delete @everyone)
    const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.name !== "@everyone" && r.position < guild.members.me.roles.highest.position);
    for (const role of roles) {
      if (cancelFlags.get(guildId)) break;
      try { await role.delete(); roleDeleted++; }
      catch { roleFailed++; }
    }

    // Bulk delete messages in current channel (last 100, Discord limit)
    let msgDeleted = 0;
    try {
      if (interaction.channel) {
        const fetched = await interaction.channel.messages.fetch({ limit: 100 });
        const recent = fetched.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        if (recent.size > 0) {
          await interaction.channel.bulkDelete(recent);
          msgDeleted = recent.size;
        }
      }
    } catch {}

    cancelFlags.delete(guildId);

    await interaction.editReply(
      `💥 **Delete All complete:**
` +
      `📁 Channels deleted: **${chDeleted}**${chFailed > 0 ? ` (${chFailed} failed)` : ""}
` +
      `🎭 Roles deleted: **${roleDeleted}**${roleFailed > 0 ? ` (${roleFailed} failed)` : ""}
` +
      `💬 Messages deleted: **${msgDeleted}** (last 100 in this channel, max 14 days old)`
    );
  }

  // ── /rename ──
  if (interaction.commandName === "rename") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    const name = interaction.options.getString("name");
    try {
      await guild.setName(name);
      await interaction.reply({ content: `✅ Server renamed to **${name}**.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ Couldn't rename the server — missing permissions?", ephemeral: true });
    }
  }

  // ── /nukechannels ──
  if (interaction.commandName === "nukechannels") {
    const guild = interaction.guild;
    if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }

    await interaction.deferReply({ ephemeral: true });
    cancelFlags.set(guildId, false);

    const channels = [...guild.channels.cache.values()].filter(ch => ch.id !== interaction.channelId);
    let deleted = 0, failed = 0;

    for (const ch of channels) {
      if (cancelFlags.get(guildId)) break;
      try { await ch.delete(); deleted++; }
      catch { failed++; }
    }

    cancelFlags.delete(guildId);
    await interaction.editReply(
      `✅ Deleted **${deleted}** channels.${failed > 0 ? ` (${failed} failed)` : ""}${deleted < channels.length ? " *(cancelled)*" : ""}`
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

// ── Echo message listener ────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const guildId = message.guild.id;
  const echo = echoTargets.get(guildId);
  if (!echo) return;
  if (echo.userId && message.author.id !== echo.userId) return;

  try {
    for (let i = 0; i < echo.times; i++) {
      await message.channel.send(message.content);
    }
  } catch {}
});

client.login(process.env.BOT_TOKEN);
