require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');

const storage = require('./storage');
const { handlePanelInteraction } = require('./panel');
const { handleVoiceStateUpdate, sweepEmptyChannels, reconcileOnStartup } = require('./voiceManager');
const { buildDashboardEmbed, refreshAllDashboards } = require('./dashboard');
const { loadCustomIcons } = require('./customIcons');

const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in your .env file — see .env.example.`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers, // privileged — must be enabled in the Dev Portal too
  ],
});

const setupCommand = new SlashCommandBuilder()
  .setName('tempvc-setup')
  .setDescription('Set up (or refresh) the temp voice channel system in this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body: [setupCommand.toJSON()],
  });
  console.log('Slash commands registered for guild', process.env.GUILD_ID);
}

// Just the category + join-to-create channel — each temp channel gets its
// own panel posted in its own chat when it's created, so there's no shared
// panel channel to set up here anymore.
async function runSetup(interaction) {
  const guild = interaction.guild;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const config = storage.getGuildConfig(guild.id) || {};

  let category = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
  if (!category) {
    category = await guild.channels.create({ name: 'Temp Channels', type: ChannelType.GuildCategory });
  }

  let joinChannel = config.joinToCreateId ? guild.channels.cache.get(config.joinToCreateId) : null;
  if (!joinChannel) {
    joinChannel = await guild.channels.create({
      name: '➕ Join to Create',
      type: ChannelType.GuildVoice,
      parent: category.id,
    });
  }

  let statsChannel = config.statsChannelId ? guild.channels.cache.get(config.statsChannelId) : null;
  if (!statsChannel) {
    statsChannel = await guild.channels.create({
      name: '📊│temp-vc-stats',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }],
    });
  }

  let statsMessage = config.statsMessageId
    ? await statsChannel.messages.fetch(config.statsMessageId).catch(() => null)
    : null;
  if (!statsMessage) {
    statsMessage = await statsChannel.send({ embeds: [buildDashboardEmbed(guild)] });
  }

  storage.setGuildConfig(guild.id, {
    categoryId: category.id,
    joinToCreateId: joinChannel.id,
    statsChannelId: statsChannel.id,
    statsMessageId: statsMessage.id,
  });

  await interaction.editReply(
    `✅ Temp VC system is ready! Join <#${joinChannel.id}> to create your own channel — the panel shows up right in its chat, and live stats are in <#${statsChannel.id}>.`
  );
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  await loadCustomIcons(client);
  try {
    await registerCommands();
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
  await reconcileOnStartup(client);
  setInterval(() => sweepEmptyChannels(client), 5 * 60 * 1000);
  setInterval(() => refreshAllDashboards(client), 20 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'tempvc-setup') {
      await runSetup(interaction);
      return;
    }
    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isUserSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      await handlePanelInteraction(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: '⚠️ Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState).catch((err) => console.error('voiceStateUpdate error:', err));
});

client.login(process.env.DISCORD_TOKEN);
