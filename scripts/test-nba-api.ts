import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

// Load env to get other keys if needed, but we'll use the provided one directly for testing
const API_KEY = '9678fa4965mshf90945e777159a5p132169jsnc2fd5e2d732c';

async function testNbaApi(host: string, endpoint: string) {
    console.log(`Testing ${host}${endpoint}...`);
    try {
        const response = await fetch(`https://${host}${endpoint}`, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': host
            }
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error('Response:', text);
            return;
        }

        const data = await response.json();
        console.log('Success! Data sample:');
        console.log(JSON.stringify(data, null, 2).substring(0, 500) + '...');
        return data;
    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

async function run() {
    // Test Candidate 1: NBA Latest News (Suspended)
    // await testNbaApi('nba-latest-news.p.rapidapi.com', '/articles');

    // Test Candidate 2: NBA News Today (Forbidden)
    // await testNbaApi('nba-news-today.p.rapidapi.com', '/news'); 

    // Test Candidate 3: API-NBA (Stats, but checking key validity)
    // await testNbaApi('api-nba-v1.p.rapidapi.com', '/seasons');

    // Test Candidate 4: Tank01 NBA Live Games
    await testNbaApi('tank01-nba-live-games.p.rapidapi.com', '/getNBANews?recentNews=true');
}

run();
