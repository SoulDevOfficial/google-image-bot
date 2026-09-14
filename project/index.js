import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import axios from 'axios';
import 'dotenv/config';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const commands = [
    new SlashCommandBuilder()
        .setName('search-images')
        .setDescription('Searches Google Images via Serper and posts 100 images.')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('The search query')
                .setRequired(true)
        )
];

async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log('Registering slash commands...');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
}

async function fetchSerperImages(query) {
    try {
        const response = await axios.post(
            'https://google.serper.dev/images',
            {
                q: query,
                num: 100
            },
            {
                headers: {
                    'X-API-KEY': process.env.SERPER_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data.images || response.data.images.length === 0) {
            return [];
        }

        return response.data.images.map((img) => img.imageUrl).filter(Boolean);
    } catch (error) {
        console.error('Serper API Request Error:', error.response?.data || error.message);
        return [];
    }
}

async function fetchImageBuffer(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        return Buffer.from(response.data);
    } catch (error) {
        console.error(`Failed to download image buffer from ${url}:`, error.message);
        return null;
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'search-images') return;

    const query = interaction.options.getString('query');
    console.log(`Command received: /search-images query="${query}" by ${interaction.user.tag} in channel ${interaction.channelId}`);

    await interaction.deferReply({ ephemeral: true });

    const imageUrls = await fetchSerperImages(query);

    if (imageUrls.length === 0) {
        console.log(`No images found for query: "${query}"`);
        await interaction.editReply('No images found.');
        return;
    }

    console.log(`Found ${imageUrls.length} images. Starting file delivery to channel ${interaction.channelId}...`);
    await interaction.editReply(`Sending ${imageUrls.length} image files to channel...`);

    const channel = interaction.channel;

    for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        
        const imageBuffer = await fetchImageBuffer(url);

        if (imageBuffer) {
            try {
                const attachment = new AttachmentBuilder(imageBuffer, { name: `image_${i + 1}.png` });
                await channel.send({ files: [attachment] });
                console.log(`[${i + 1}/${imageUrls.length}] Uploaded image file successfully.`);
            } catch (error) {
                console.error(`Failed to upload image file [${i + 1}/${imageUrls.length}]:`, error.message);
            }
        } else {
            console.log(`[${i + 1}/${imageUrls.length}] Skipped image due to download error.`);
        }

        if (i < imageUrls.length - 1) {
            await delay(3000);
        }
    }

    console.log(`Finished sending images for query: "${query}"`);
});

client.login(process.env.DISCORD_TOKEN);
