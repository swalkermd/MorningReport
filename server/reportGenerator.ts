import path from "path";
import { storage } from "./storage";
import { scrapeAllNews, NEWS_TOPICS } from "./newsService";
import { generateNewsReport, generateAudioFromText } from "./openai";
import { promises as fs } from "fs";

export async function generateDailyReport(): Promise<void> {
  console.log("Step 1: Scraping news from all sources...");
  const newsContent = await scrapeAllNews();
  
  const successfulTopics = newsContent.filter(content => content.articles.length > 0);
  console.log(`Step 2: Retrieved news for ${successfulTopics.length} topics`);
  
  // Topic coverage monitoring - compare against all 13 expected topics
  console.log('\n=== TOPIC COVERAGE SUMMARY ===');
  console.log(`✓ Successful: ${successfulTopics.length}/${NEWS_TOPICS.length} topics`);
  console.log('With data:', successfulTopics.map(t => t.topic).join(', ') || 'None');
  
  // Find which topics are missing by comparing with full NEWS_TOPICS list
  const successfulTopicNames = new Set(successfulTopics.map(t => t.topic));
  const failedTopics = NEWS_TOPICS.filter(t => !successfulTopicNames.has(t.name)).map(t => t.name);
  
  if (failedTopics.length > 0) {
    console.log(`✗ Missing: ${failedTopics.length}/${NEWS_TOPICS.length} topics`);
    console.log('Without data:', failedTopics.join(', '));
    
    if (failedTopics.length > 8) {
      console.warn('\n⚠️  HIGH FAILURE RATE: This is likely due to API rate limiting during testing');
      console.warn('In production (once daily at 5:30 AM), expect 10-13/13 topics to succeed');
    } else if (failedTopics.length > 3) {
      console.warn('\n⚠️  MODERATE FAILURE: Some topics consistently missing - may need query optimization');
    }
  } else {
    console.log('✓ Perfect coverage: All 13 topics have data!');
  }
  console.log('==============================\n');
  
  // Get previous 5 reports for context
  const previousReports = await storage.getRecentReports(5);
  const previousReportTexts = previousReports.map(r => r.content);
  
  console.log(`Step 3: Found ${previousReports.length} previous reports for context`);
  console.log("Step 4: Generating AI news report...");
  
  // Set to 5:30 AM on the current day
  const reportDate = new Date();
  reportDate.setHours(5, 30, 0, 0);
  
  let reportText = await generateNewsReport(newsContent, previousReportTexts, reportDate);
  
  // Validate and fix closing line to ensure consistency
  const requiredClosing = "That's it for the morning report. Have a great day!";
  if (!reportText.trim().endsWith(requiredClosing)) {
    console.log("Warning: Fixing incorrect closing line");
    // Remove any existing closing and add the correct one
    reportText = reportText.trim().replace(/\n[^\n]*$/m, '') + "\n\n" + requiredClosing;
  }
  
  console.log(`Step 5: Generated report (${reportText.length} characters)`);
  console.log("Step 6: Converting text to speech...");
  
  // Generate audio file(s) - may be split into multiple parts
  const audioFileName = `report-${Date.now()}.mp3`;
  const audioPath = path.join(process.cwd(), "audio-reports", audioFileName);
  
  const generatedAudioPaths = await generateAudioFromText(reportText, audioPath);
  
  console.log(`Step 7: Audio generated - ${generatedAudioPaths.length} part(s)`);
  console.log("Step 8: Saving report to storage...");
  
  // Convert file system paths to web paths
  const webAudioPaths = generatedAudioPaths.map(p => {
    const fileName = path.basename(p);
    return `/audio/${fileName}`;
  });
  
  await storage.createReport({
    date: reportDate,
    content: reportText,
    audioPath: webAudioPaths[0],
    audioPaths: webAudioPaths,
  });
  
  console.log("Report generation complete!");
  
  // Clean up old audio files (keep last 30 days)
  await cleanupOldAudioFiles();
}

/**
 * Cleanup old audio files to prevent unlimited disk usage
 * Keeps files from the last 30 days, deletes older ones
 */
async function cleanupOldAudioFiles(): Promise<void> {
  const audioDir = path.join(process.cwd(), "audio-reports");
  const RETENTION_DAYS = 30;
  const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  
  try {
    const files = await fs.readdir(audioDir);
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('.mp3')) continue;
      
      const filePath = path.join(audioDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtimeMs < cutoffTime) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[Cleanup] Deleted ${deletedCount} audio file(s) older than ${RETENTION_DAYS} days`);
    }
  } catch (error) {
    console.error("[Cleanup] Error cleaning up audio files:", error);
  }
}
