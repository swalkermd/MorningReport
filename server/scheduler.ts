import cron from "node-cron";
import { generateDailyReport } from "./reportGenerator";
import { storage } from "./storage";

export function startScheduler() {
  // Schedule daily report generation at 5:30 AM PST
  // Cron format: minute hour day month weekday
  // PST is UTC-8, so 5:30 AM PST = 13:30 UTC (during standard time)
  // Note: Adjust for daylight saving time if needed
  
  const cronExpression = "30 13 * * *"; // 5:30 AM PST (13:30 UTC)
  
  cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] Starting scheduled daily report generation...`);
    
    try {
      await generateDailyReport();
      console.log(`[${new Date().toISOString()}] Daily report generated successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error generating daily report:`, error);
    }
  }, {
    timezone: "America/Los_Angeles"
  });
  
  console.log("Report scheduler started - will generate reports daily at 5:30 AM PST");
  
  // Also generate a report on startup if there isn't one for today (for testing)
  setTimeout(async () => {
    console.log("Checking if we need to generate an initial report...");
    const latestReport = await storage.getLatestReport();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (!latestReport || new Date(latestReport.date) < today) {
      console.log("No report for today found. Generating initial report...");
      try {
        await generateDailyReport();
        console.log("Initial report generated successfully");
      } catch (error) {
        console.error("Error generating initial report:", error);
      }
    } else {
      console.log("Report for today already exists");
    }
  }, 2000);
}
