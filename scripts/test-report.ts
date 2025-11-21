import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Manually load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
    console.log('Loaded .env file');
} else {
    console.warn('.env file not found at', envPath);
}

async function run() {
    try {
        // Dynamic import to ensure env vars are loaded first
        const { generateDailyReport } = await import("../server/reportGenerator");
        console.log("Starting manual report generation test...");
        await generateDailyReport(true);
        console.log("Report generation finished.");
    } catch (err) {
        console.error("Report generation failed:", err);
    }
}

run();
