import path from "path";
import { storage } from "./storage";
import { scrapeAllNews } from "./newsService";
import { generateNewsReport, generateAudioFromText } from "./openai";

export async function generateDailyReport(): Promise<void> {
  console.log("Step 1: Scraping news from all sources...");
  const newsContent = await scrapeAllNews();
  
  console.log(`Step 2: Retrieved news for ${newsContent.length} topics`);
  
  // Get previous 5 reports for context
  const previousReports = await storage.getRecentReports(5);
  const previousReportTexts = previousReports.map(r => r.content);
  
  console.log(`Step 3: Found ${previousReports.length} previous reports for context`);
  console.log("Step 4: Generating AI news report...");
  
  // Set to 6 AM on the current day
  const reportDate = new Date();
  reportDate.setHours(6, 0, 0, 0);
  
  const reportText = await generateNewsReport(newsContent, previousReportTexts, reportDate);
  
  console.log(`Step 5: Generated report (${reportText.length} characters)`);
  console.log("Step 6: Converting text to speech...");
  
  // Generate audio file
  const audioFileName = `report-${Date.now()}.mp3`;
  const audioPath = path.join(process.cwd(), "audio-reports", audioFileName);
  
  await generateAudioFromText(reportText, audioPath);
  
  console.log(`Step 7: Audio generated at ${audioPath}`);
  console.log("Step 8: Saving report to storage..."); // Set to 6 AM
  
  await storage.createReport({
    date: reportDate,
    content: reportText,
    audioPath: `/audio/${audioFileName}`,
  });
  
  console.log("Report generation complete!");
}
