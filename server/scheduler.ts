import cron from "node-cron";
import { generateDailyReport } from "./reportGenerator";
import { storage } from "./storage";

/**
 * Detect if running in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === 'true';
}

/**
 * Get expected audio storage mode based on environment
 * - Production: Should use cloud storage (GCS URLs)
 * - Development: Should use local storage (filesystem paths)
 */
function getExpectedAudioStorageMode(): 'cloud' | 'local' {
  return isProduction() ? 'cloud' : 'local';
}

/**
 * Detect actual audio storage mode from a path
 */
function detectAudioPathMode(audioPath: string | null | undefined): 'cloud' | 'local' | 'unknown' {
  if (!audioPath) return 'unknown';
  if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
    return 'cloud';
  }
  if (audioPath.startsWith('/')) {
    return 'local';
  }
  return 'unknown';
}

/**
 * Validate storage mode consistency
 * Returns true if storage mode matches environment expectations
 */
async function validateStorageMode(): Promise<{ valid: boolean; message: string }> {
  const expected = getExpectedAudioStorageMode();
  const latestReport = await storage.getLatestReport();
  
  if (!latestReport) {
    return { valid: true, message: 'No existing reports to validate' };
  }
  
  // Collect all audio paths to validate (both single and multi-segment)
  const pathsToValidate: string[] = [];
  if (latestReport.audioPath) {
    pathsToValidate.push(latestReport.audioPath);
  }
  if (latestReport.audioPaths && latestReport.audioPaths.length > 0) {
    pathsToValidate.push(...latestReport.audioPaths);
  }
  
  // If no audio paths at all, nothing to validate
  if (pathsToValidate.length === 0) {
    return { valid: true, message: 'No audio paths found in latest report' };
  }
  
  // Validate all paths match expected mode
  const detectedModes = new Set<string>();
  const invalidPaths: string[] = [];
  
  for (const path of pathsToValidate) {
    const mode = detectAudioPathMode(path);
    
    if (mode === 'unknown') {
      invalidPaths.push(path);
      continue;
    }
    
    detectedModes.add(mode);
    
    if (mode !== expected) {
      invalidPaths.push(path);
    }
  }
  
  // Report unknown path formats
  if (invalidPaths.length > 0 && detectedModes.has('unknown')) {
    return {
      valid: false,
      message: `Unknown audio path format detected in report ${latestReport.id}: ${invalidPaths[0]}`
    };
  }
  
  // Report storage mode mismatches
  if (invalidPaths.length > 0) {
    const actualMode = Array.from(detectedModes).filter(m => m !== 'unknown')[0] || 'unknown';
    return {
      valid: false,
      message: `Storage mode mismatch! Environment expects ${expected} storage, but report ${latestReport.id} uses ${actualMode} paths (found ${invalidPaths.length} mismatched paths: ${invalidPaths.slice(0, 2).join(', ')}${invalidPaths.length > 2 ? ', ...' : ''}). This will cause audio playback failures in production.`
    };
  }
  
  const validatedMode = Array.from(detectedModes)[0];
  return { 
    valid: true, 
    message: `Storage mode validated: ${validatedMode} storage matches environment (checked ${pathsToValidate.length} audio path${pathsToValidate.length > 1 ? 's' : ''})` 
  };
}

export function startScheduler() {
  // Schedule daily report generation at 5:30 AM Pacific Time
  // Cron format: minute hour day month weekday
  // When using timezone option, specify time in LOCAL time zone (not UTC)
  // node-cron automatically handles PST/PDT transitions
  
  const cronExpression = "30 5 * * *"; // 5:30 AM Pacific Time
  
  cron.schedule(cronExpression, async () => {
    const now = new Date();
    const pstTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    console.log(`[${now.toISOString()}] [PST: ${pstTime.toLocaleString()}] Starting scheduled daily report generation...`);
    
    // Validate storage mode before generating scheduled reports
    const validation = await validateStorageMode();
    console.log(`[${now.toISOString()}] [Storage Mode] ${validation.message}`);
    
    if (!validation.valid) {
      console.error(`[${now.toISOString()}] [Storage Mode] ⚠️  CRITICAL: ${validation.message}`);
      console.error(`[${now.toISOString()}] [Storage Mode] Aborting scheduled report generation.`);
      return;
    }
    
    try {
      await generateDailyReport(true); // Always use fresh API calls for scheduled reports
      console.log(`[${now.toISOString()}] Daily report generated successfully`);
    } catch (error) {
      console.error(`[${now.toISOString()}] Error generating daily report:`, error);
    }
  }, {
    timezone: "America/Los_Angeles"
  });
  
  console.log("Report scheduler started - will generate reports daily at 5:30 AM PST");
  
  // Also generate a report on startup if there isn't one for today (for testing)
  setTimeout(async () => {
    console.log("Checking if we need to generate an initial report...");
    
    // First, validate storage mode consistency
    const validation = await validateStorageMode();
    console.log(`[Storage Mode] ${validation.message}`);
    
    if (!validation.valid) {
      console.error("[Storage Mode] ⚠️  WARNING: " + validation.message);
      console.error("[Storage Mode] Skipping report generation to prevent production issues.");
      console.error("[Storage Mode] Please ensure STORAGE_MODE env var matches your environment:");
      console.error("[Storage Mode]   - Development: Use local audio storage (filesystem)");
      console.error("[Storage Mode]   - Production: Use cloud audio storage (GCS URLs)");
      return;
    }
    
    const latestReport = await storage.getLatestReport();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (!latestReport || new Date(latestReport.date) < today) {
      console.log("No report for today found. Generating initial report...");
      try {
        await generateDailyReport(true); // Always use fresh API calls for automatic reports
        console.log("Initial report generated successfully");
      } catch (error) {
        console.error("Error generating initial report:", error);
      }
    } else {
      console.log("Report for today already exists");
    }
  }, 2000);
}
