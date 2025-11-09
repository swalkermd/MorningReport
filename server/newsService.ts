import { NewsContent } from "./openai";
import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";

// MediaStack daily usage tracking
const MEDIASTACK_USAGE_FILE = path.join(process.cwd(), 'data', 'mediastack-usage.json');
const MEDIASTACK_DAILY_LIMIT = 3;

interface MediaStackUsage {
  date: string;
  count: number;
}

async function getMediaStackUsageToday(): Promise<number> {
  try {
    const data = await fs.readFile(MEDIASTACK_USAGE_FILE, 'utf-8');
    const usage: MediaStackUsage = JSON.parse(data);
    const today = new Date().toISOString().split('T')[0];
    
    if (usage.date === today) {
      return usage.count;
    }
    return 0; // New day, reset counter
  } catch (error) {
    return 0; // File doesn't exist or error reading
  }
}

async function incrementMediaStackUsage(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const currentCount = await getMediaStackUsageToday();
  
  const usage: MediaStackUsage = {
    date: today,
    count: currentCount + 1
  };
  
  try {
    await fs.mkdir(path.dirname(MEDIASTACK_USAGE_FILE), { recursive: true });
    await fs.writeFile(MEDIASTACK_USAGE_FILE, JSON.stringify(usage, null, 2));
    console.log(`[MediaStack] Usage: ${usage.count}/${MEDIASTACK_DAILY_LIMIT} calls today`);
  } catch (error) {
    console.error('[MediaStack] Failed to update usage tracking:', error);
  }
}

// Topic freshness tiers
// Tier 1 (Breaking News): 24 hours - time-sensitive news that goes stale quickly
// Tier 2 (Tech/Science): 96 hours (4 days) - slower-moving tech/science stories
const FRESHNESS_TIERS = {
  breaking: 24, // hours
  tech: 96,     // hours (4 days)
};

// News topics configuration - refined for better search results
export const NEWS_TOPICS = [
  { name: "World News", query: "breaking world news today major events", freshness: FRESHNESS_TIERS.breaking },
  { name: "US News", query: "united states news headlines today", freshness: FRESHNESS_TIERS.breaking },
  { name: "Redlands CA Local News", query: "Redlands California news", freshness: FRESHNESS_TIERS.breaking },
  { name: "NBA", query: "NBA games highlights players standings", freshness: FRESHNESS_TIERS.breaking },
  { name: "AI & Machine Learning", query: "artificial intelligence breakthrough announcements today", freshness: FRESHNESS_TIERS.tech },
  { name: "Electric Vehicles", query: "electric vehicle EV automotive news announcements", freshness: FRESHNESS_TIERS.tech },
  { name: "Autonomous Driving", query: "self-driving autonomous vehicle technology news", freshness: FRESHNESS_TIERS.tech },
  { name: "Humanoid Robots", query: "humanoid robot development boston dynamics tesla optimus", freshness: FRESHNESS_TIERS.tech },
  { name: "eVTOL & Flying Vehicles", query: "eVTOL flying car urban air mobility news", freshness: FRESHNESS_TIERS.tech },
  { name: "Tech Gadgets", query: "consumer technology gadget product launches 2025", freshness: FRESHNESS_TIERS.tech },
  { name: "Anti-Aging Science", query: "longevity anti-aging research breakthrough", freshness: FRESHNESS_TIERS.tech },
  { name: "Virtual Medicine", query: "telemedicine digital health technology news", freshness: FRESHNESS_TIERS.tech },
  { name: "Travel", query: "travel industry airlines destinations news today", freshness: FRESHNESS_TIERS.breaking },
];

/**
 * Fetches news from Brave Search API
 * Primary search source with generous free tier (2,000 queries/month)
 */
async function scrapeNewsBraveSearch(topic: { name: string; query: string; freshness: number }): Promise<NewsContent> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  
  if (!apiKey) {
    console.error(`[BraveSearch] API key not configured - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(topic.query)}&count=5&freshness=pd`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(10000)
      }
    );
    
    if (response.status === 429) {
      console.warn(`[BraveSearch] Rate limit hit for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[BraveSearch] Error for ${topic.name}:`, errorData);
      return { topic: topic.name, articles: [] };
    }
    
    const data = await response.json();
    
    if (!data.web?.results || data.web.results.length === 0) {
      console.warn(`[BraveSearch] No results found for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    // Parse and validate articles with timestamps
    const articlesWithTimestamps = data.web.results
      .filter((result: any) => {
        const hasTitle = result.title && result.title.length > 10;
        const hasDescription = result.description && result.description.length > 30;
        const hasUrl = result.url;
        return hasTitle && hasDescription && hasUrl;
      })
      .map((result: any) => {
        // Parse timestamp from Brave Search result
        let publishedAt: string | null = null;
        
        if (result.age) {
          // Try to parse relative time strings from Brave ("14 minutes ago", "2 hours ago", "1 day ago")
          const relativeTimeMatch = result.age.match(/^(\d+)\s+(minute|hour|day)s?\s+ago$/i);
          
          if (relativeTimeMatch) {
            const amount = parseInt(relativeTimeMatch[1]);
            const unit = relativeTimeMatch[2].toLowerCase();
            const now = new Date();
            
            let millisAgo = 0;
            if (unit === 'minute') {
              millisAgo = amount * 60 * 1000;
            } else if (unit === 'hour') {
              millisAgo = amount * 60 * 60 * 1000;
            } else if (unit === 'day') {
              millisAgo = amount * 24 * 60 * 60 * 1000;
            }
            
            if (millisAgo > 0) {
              const articleDate = new Date(now.getTime() - millisAgo);
              publishedAt = articleDate.toISOString();
            }
          } else {
            // Try parsing as absolute date
            try {
              const parsed = new Date(result.age);
              if (!isNaN(parsed.getTime())) {
                publishedAt = parsed.toISOString();
              }
            } catch {
              // Could not parse
            }
          }
        }
        
        return {
          title: result.title,
          summary: result.description,
          source: new URL(result.url).hostname.replace('www.', ''),
          url: result.url,
          publishedAt,
          rawAge: result.age, // Keep for logging
        };
      })
      .filter((article: any) => {
        // CRITICAL: Discard articles without parseable timestamps
        // Do NOT fabricate timestamps - this allows stale content through
        if (!article.publishedAt) {
          console.log(`[BraveSearch] Discarded article without parseable timestamp: "${article.title.substring(0, 50)}" (age: ${article.rawAge})`);
          return false;
        }
        
        // Additionally validate freshness here (belt and suspenders)
        const publishedDate = new Date(article.publishedAt);
        const now = new Date();
        const ageHours = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > topic.freshness) {
          console.log(`[BraveSearch] Discarded stale article (${ageHours.toFixed(1)}h old, max ${topic.freshness}h): "${article.title.substring(0, 50)}"`);
          return false;
        }
        
        return true;
      })
      .map(({ rawAge, ...article }: any) => article); // Remove rawAge from final output
    
    const validArticles = articlesWithTimestamps.slice(0, 3);
    
    if (validArticles.length === 0) {
      console.warn(`[BraveSearch] No valid results after filtering for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    console.log(`[BraveSearch] Successfully fetched ${validArticles.length} results for ${topic.name}`);
    return {
      topic: topic.name,
      articles: validArticles,
    };
    
  } catch (error) {
    console.error(`[BraveSearch] Error fetching ${topic.name}:`, error);
    return { topic: topic.name, articles: [] };
  }
}

/**
 * Fetches news from MediaStack API (4th fallback source)
 * Free tier: 100 requests/month, limited to 3 calls/day
 * Used only when Brave Search, NewsAPI, and CurrentsAPI all fail
 */
async function scrapeNewsMediaStack(topic: { name: string; query: string; freshness: number }): Promise<NewsContent> {
  const apiKey = process.env.MEDIASTACK_API_KEY;
  
  if (!apiKey) {
    console.error(`[MediaStack] API key not configured - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  // Check daily usage limit
  const usageToday = await getMediaStackUsageToday();
  if (usageToday >= MEDIASTACK_DAILY_LIMIT) {
    console.warn(`[MediaStack] Daily limit reached (${usageToday}/${MEDIASTACK_DAILY_LIMIT}) - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  try {
    // MediaStack uses keywords parameter and date filtering
    // Free tier only supports HTTP (not HTTPS)
    const response = await fetch(
      `http://api.mediastack.com/v1/news?access_key=${apiKey}&keywords=${encodeURIComponent(topic.query)}&languages=en&limit=5&sort=published_desc`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    // Increment usage counter after successful API call
    await incrementMediaStackUsage();
    
    if (response.status === 429) {
      console.warn(`[MediaStack] Rate limit hit for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[MediaStack] Error for ${topic.name}:`, errorData);
      return { topic: topic.name, articles: [] };
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.warn(`[MediaStack] No articles found for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    // Filter and validate articles
    const validArticles = data.data
      .filter((article: any) => {
        const hasTitle = article.title && article.title.length > 10;
        const hasDescription = article.description && article.description.length > 30;
        const hasSource = article.source;
        return hasTitle && hasDescription && hasSource;
      })
      .map((article: any) => ({
        title: article.title,
        summary: article.description,
        source: article.source,
        url: article.url,
        publishedAt: article.published_at,
      }))
      .filter((article: any) => isArticleFresh(article, topic.freshness))
      .slice(0, 3);
    
    if (validArticles.length === 0) {
      console.warn(`[MediaStack] No valid articles after filtering for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    console.log(`[MediaStack] Successfully fetched ${validArticles.length} articles for ${topic.name}`);
    return {
      topic: topic.name,
      articles: validArticles,
    };
    
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error(`[MediaStack] Timeout fetching ${topic.name}`);
    } else {
      console.error(`[MediaStack] Error fetching ${topic.name}:`, error);
    }
    return { topic: topic.name, articles: [] };
  }
}

/**
 * Fetches news from CurrentsAPI
 */
async function scrapeNewsCurrentsAPI(topic: { name: string; query: string; freshness: number }): Promise<NewsContent> {
  const apiKey = process.env.CURRENTS_API_KEY;
  
  if (!apiKey) {
    console.error(`[CurrentsAPI] API key not configured - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  // Calculate freshness window based on topic tier (RFC 3339 format for CurrentsAPI)
  const now = new Date();
  const startTime = new Date(now.getTime() - topic.freshness * 60 * 60 * 1000);
  const startDate = startTime.toISOString(); // RFC 3339 format: 2025-11-09T06:00:00.000Z
  
  try {
    const response = await fetch(
      `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(topic.query)}&start_date=${startDate}&language=en&apiKey=${apiKey}`,
      { signal: AbortSignal.timeout(30000) }
    );
    
    if (response.status === 429) {
      console.warn(`[CurrentsAPI] Rate limit hit for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[CurrentsAPI] Error for ${topic.name}:`, errorData);
      return { topic: topic.name, articles: [] };
    }
    
    const data = await response.json();
    
    if (!data.news || data.news.length === 0) {
      console.warn(`[CurrentsAPI] No articles found for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    const validArticles = data.news
      .filter((article: any) => {
        const hasTitle = article.title && article.title.length > 10;
        const hasDescription = article.description && article.description.length > 30;
        return hasTitle && hasDescription;
      })
      .slice(0, 3)
      .map((article: any) => ({
        title: article.title,
        summary: article.description,
        source: article.author || "Currents News",
        url: article.url,
        publishedAt: article.published,
      }));
    
    if (validArticles.length === 0) {
      console.warn(`[CurrentsAPI] No valid articles after filtering for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    console.log(`[CurrentsAPI] Successfully fetched ${validArticles.length} articles for ${topic.name}`);
    return {
      topic: topic.name,
      articles: validArticles,
    };
    
  } catch (error) {
    console.error(`[CurrentsAPI] Error fetching ${topic.name}:`, error);
    return { topic: topic.name, articles: [] };
  }
}

/**
 * Fetches news using OpenAI (generates plausible news summaries as last resort)
 * Note: This doesn't use real-time web search, so it's disabled for now
 */
async function scrapeNewsOpenAI(topic: { name: string; query: string }): Promise<NewsContent> {
  // Disabled for now - OpenAI web search requires special API access or different model
  // CurrentsAPI + NewsAPI should provide sufficient coverage
  console.log(`[OpenAI] Skipping ${topic.name} - web search not available with current API setup`);
  return { topic: topic.name, articles: [] };
}

/**
 * Fetches real news for a given topic using NewsAPI with robust error handling
 * Returns empty articles array if real news unavailable to prevent vague content
 */
export async function scrapeNewsFromNewsAPI(topic: { name: string; query: string; freshness: number }): Promise<NewsContent> {
  const apiKey = process.env.NEWSAPI_KEY;
  
  if (!apiKey) {
    console.error(`[NewsAPI] API key not configured - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  // Calculate freshness window based on topic tier (ISO format for NewsAPI)
  const now = new Date();
  const startTime = new Date(now.getTime() - topic.freshness * 60 * 60 * 1000);
  const fromDate = startTime.toISOString();
  
  const maxRetries = 2;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[NewsAPI] Retry ${attempt}/${maxRetries} for ${topic.name} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
      
      const response = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic.query)}&from=${fromDate}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );
      
      // Handle rate limiting
      if (response.status === 429) {
        console.warn(`[NewsAPI] Rate limit hit for ${topic.name}`);
        lastError = new Error('Rate limit exceeded');
        continue;
      }
      
      // Handle server errors with retry
      if (response.status >= 500) {
        console.warn(`[NewsAPI] Server error ${response.status} for ${topic.name}`);
        lastError = new Error(`Server error: ${response.status}`);
        continue;
      }
      
      // Handle client errors (don't retry)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[NewsAPI] Error for ${topic.name}:`, errorData);
        return { topic: topic.name, articles: [] };
      }
      
      const data = await response.json();
      
      if (!data.articles || data.articles.length === 0) {
        console.warn(`[NewsAPI] No articles found for ${topic.name}`);
        return { topic: topic.name, articles: [] };
      }
      
      // Filter out articles with insufficient detail
      const validArticles = data.articles
        .filter((article: any) => {
          const hasTitle = article.title && article.title.length > 10;
          const hasDescription = article.description && article.description.length > 30;
          const hasSource = article.source?.name;
          return hasTitle && hasDescription && hasSource;
        })
        .slice(0, 3)
        .map((article: any) => ({
          title: article.title,
          summary: article.description,
          source: article.source.name,
          url: article.url,
          publishedAt: article.publishedAt,
        }));
      
      if (validArticles.length === 0) {
        console.warn(`[NewsAPI] No valid articles after filtering for ${topic.name}`);
        return { topic: topic.name, articles: [] };
      }
      
      console.log(`[NewsAPI] Successfully fetched ${validArticles.length} articles for ${topic.name}`);
      return {
        topic: topic.name,
        articles: validArticles,
      };
      
    } catch (error) {
      lastError = error as Error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.error(`[NewsAPI] Timeout fetching ${topic.name}`);
      } else {
        console.error(`[NewsAPI] Error fetching ${topic.name}:`, error);
      }
    }
  }
  
  // All retries exhausted
  console.error(`[NewsAPI] Failed to fetch ${topic.name} after ${maxRetries} retries:`, lastError);
  return { topic: topic.name, articles: [] };
}

/**
 * Validates article freshness - rejects articles older than the specified max age
 * Returns true if article is fresh, false if stale
 */
function isArticleFresh(article: any, maxAgeHours: number = 24): boolean {
  if (!article.publishedAt) {
    console.warn(`[Freshness] Article missing publishedAt timestamp: ${article.title?.substring(0, 50)}`);
    return false; // Reject articles without timestamps
  }
  
  try {
    const publishedDate = new Date(article.publishedAt);
    const now = new Date();
    const ageHours = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
    
    // Reject articles older than max age
    if (ageHours > maxAgeHours) {
      console.log(`[Freshness] Rejected stale article (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h): ${article.title?.substring(0, 60)}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn(`[Freshness] Failed to parse publishedAt for article: ${article.title?.substring(0, 50)}`);
    return false;
  }
}

/**
 * Normalize article title for comparison (lowercase, remove punctuation/whitespace)
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if two articles are duplicates based on title similarity
 */
function isDuplicate(article1: any, article2: any): boolean {
  // Check URL match first (most reliable)
  if (article1.url && article2.url && article1.url === article2.url) {
    return true;
  }
  
  // Check title similarity (handle minor variations)
  const title1 = normalizeTitle(article1.title);
  const title2 = normalizeTitle(article2.title);
  
  // Exact match
  if (title1 === title2) {
    return true;
  }
  
  // Check if one title contains the other (handles truncated headlines)
  if (title1.length > 20 && title2.length > 20) {
    const shorter = title1.length < title2.length ? title1 : title2;
    const longer = title1.length < title2.length ? title2 : title1;
    if (longer.includes(shorter)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Smart multi-source news scraping with dual primary sources
 * Calls BOTH Brave Search AND NewsAPI in parallel, then intelligently merges results
 * Features: deduplication, quality filtering, and recency sorting
 * Falls back to CurrentsAPI only if both primary sources fail
 */
export async function scrapeNews(topic: { name: string; query: string; freshness: number }): Promise<NewsContent> {
  console.log(`\n[Multi-Source] Fetching news for: ${topic.name}`);
  
  // Call BOTH Brave Search AND NewsAPI in parallel for maximum coverage
  const [braveResult, newsApiResult] = await Promise.all([
    scrapeNewsBraveSearch(topic),
    scrapeNewsFromNewsAPI(topic)
  ]);
  
  // Start with NewsAPI articles (typically higher quality with better timestamps)
  const mergedArticles: any[] = [...newsApiResult.articles];
  
  // Add Brave Search articles that aren't duplicates
  for (const braveArticle of braveResult.articles) {
    const isDupe = mergedArticles.some(existing => isDuplicate(existing, braveArticle));
    if (!isDupe) {
      mergedArticles.push(braveArticle);
    }
  }
  
  if (mergedArticles.length > 0) {
    // Filter out stale articles based on topic's freshness tier
    const freshArticles = mergedArticles.filter(article => isArticleFresh(article, topic.freshness));
    
    if (freshArticles.length === 0) {
      console.warn(`[Multi-Source] ✗ ${topic.name} - All ${mergedArticles.length} articles filtered out as stale (>${topic.freshness}h old)`);
      // Fall back to CurrentsAPI
      const currentsResult = await scrapeNewsCurrentsAPI(topic);
      if (currentsResult.articles.length > 0) {
        const freshCurrentsArticles = currentsResult.articles.filter(article => isArticleFresh(article, topic.freshness));
        if (freshCurrentsArticles.length > 0) {
          console.log(`[Multi-Source] ✓ ${topic.name} - Using CurrentsAPI backup (${freshCurrentsArticles.length} fresh articles)`);
          return { topic: topic.name, articles: freshCurrentsArticles.slice(0, 4) };
        }
      }
      return { topic: topic.name, articles: [] };
    }
    
    // Sort by recency (most recent first) - prioritize articles with valid timestamps
    const sortedArticles = freshArticles.sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA; // Descending (newest first)
    });
    
    // Limit to top 4 articles per topic to maintain quality
    const topArticles = sortedArticles.slice(0, 4);
    
    console.log(`[Multi-Source] ✓ ${topic.name} - Merged Brave (${braveResult.articles.length}) + NewsAPI (${newsApiResult.articles.length}) → ${mergedArticles.length} unique → ${freshArticles.length} fresh → top ${topArticles.length} selected`);
    
    return {
      topic: topic.name,
      articles: topArticles
    };
  }
  
  // Both primary sources failed - fall back to CurrentsAPI
  console.log(`[Multi-Source] Both primary sources failed for ${topic.name}, trying CurrentsAPI backup...`);
  const currentsResult = await scrapeNewsCurrentsAPI(topic);
  if (currentsResult.articles.length > 0) {
    console.log(`[Multi-Source] ✓ ${topic.name} - Using CurrentsAPI backup (${currentsResult.articles.length} articles)`);
    return currentsResult;
  }
  
  // If all 3 sources failed, try MediaStack as 4th fallback (with daily limit)
  console.log(`[Multi-Source] All 3 sources failed for ${topic.name}, trying MediaStack (4th fallback)...`);
  const mediastackResult = await scrapeNewsMediaStack(topic);
  
  if (mediastackResult.articles.length > 0) {
    console.log(`[Multi-Source] ✓ ${topic.name} - Using MediaStack backup (${mediastackResult.articles.length} articles)`);
    return mediastackResult;
  }
  
  // All 4 sources failed
  console.error(`[Multi-Source] ✗ ${topic.name} - All 4 sources failed (Brave + NewsAPI + Currents + MediaStack)`);
  return { topic: topic.name, articles: [] };
}

const CACHE_DIR = path.join(process.cwd(), "cache");

/**
 * Get the cache file path for a given date
 */
function getCacheFilePath(date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(CACHE_DIR, `news-${dateStr}.json`);
}

const MIN_TOPICS_FOR_CACHE = 5; // Require at least 5 topics for valid cache

/**
 * Read news data from cache
 * In development mode, will use the most recent cache file regardless of date
 * In production, only returns cache for the specified date
 * Only returns cache if it has sufficient coverage (MIN_TOPICS_FOR_CACHE)
 */
async function readNewsCache(date: Date = new Date()): Promise<NewsContent[] | null> {
  try {
    let cacheFile = getCacheFilePath(date);
    
    // In development mode, if today's cache doesn't exist, use the most recent cache
    if (process.env.NODE_ENV === 'development') {
      try {
        await fs.access(cacheFile);
      } catch {
        // Today's cache doesn't exist, find the most recent cache file
        console.log(`[Cache] Today's cache not found, looking for most recent cache...`);
        try {
          const files = await fs.readdir(CACHE_DIR);
          const cacheFiles = files
            .filter(f => f.startsWith('news-') && f.endsWith('.json'))
            .sort()
            .reverse();
          
          if (cacheFiles.length > 0) {
            cacheFile = path.join(CACHE_DIR, cacheFiles[0]);
            console.log(`[Cache] Using most recent cache: ${cacheFiles[0]}`);
          }
        } catch {
          // No cache directory or files
          return null;
        }
      }
    }
    
    const data = await fs.readFile(cacheFile, 'utf-8');
    const cached = JSON.parse(data);
    
    // Validate cache has minimum coverage
    if (!Array.isArray(cached) || cached.length < MIN_TOPICS_FOR_CACHE) {
      console.warn(`[Cache] ⚠ Cache has insufficient coverage (${cached?.length || 0}/${MIN_TOPICS_FOR_CACHE} topics) - fetching fresh data`);
      return null;
    }
    
    console.log(`[Cache] ✓ Loaded ${cached.length} topics from cache (${cacheFile})`);
    return cached;
  } catch (error) {
    // Cache doesn't exist or is invalid
    return null;
  }
}

/**
 * Write news data to cache
 * Only saves if data has sufficient coverage (MIN_TOPICS_FOR_CACHE)
 */
async function writeNewsCache(data: NewsContent[], date: Date = new Date()): Promise<void> {
  try {
    // Don't cache insufficient data
    if (!Array.isArray(data) || data.length < MIN_TOPICS_FOR_CACHE) {
      console.warn(`[Cache] ⚠ Not caching insufficient data (${data?.length || 0}/${MIN_TOPICS_FOR_CACHE} topics) - will retry on next request`);
      return;
    }
    
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheFile = getCacheFilePath(date);
    await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[Cache] ✓ Saved ${data.length} topics to cache (${cacheFile})`);
  } catch (error) {
    console.error('[Cache] Error writing cache:', error);
  }
}

/**
 * Clear news cache (useful for testing)
 */
export async function clearNewsCache(date?: Date): Promise<void> {
  try {
    const cacheFile = getCacheFilePath(date);
    await fs.unlink(cacheFile);
    console.log(`[Cache] ✓ Cleared cache (${cacheFile})`);
  } catch (error) {
    console.log('[Cache] No cache to clear or error:', error);
  }
}

/**
 * Fetches all news with intelligent caching
 * - Checks cache first
 * - If cache exists and not forced refresh, returns cached data
 * - Otherwise fetches fresh data and saves to cache
 * @param forceRefresh - If true, bypasses cache and fetches fresh data
 */
export async function scrapeAllNews(forceRefresh: boolean = false): Promise<NewsContent[]> {
  // Check cache first unless forced refresh
  if (!forceRefresh) {
    const cached = await readNewsCache();
    if (cached) {
      console.log('[Cache] Using cached news data - no API calls made');
      return cached;
    }
  }
  
  const results: NewsContent[] = [];
  
  console.log(`\n${"=".repeat(60)}\n  STARTING MULTI-SOURCE NEWS AGGREGATION\n${"=".repeat(60)}`);
  
  // Fetch news for each topic sequentially to avoid overwhelming APIs
  for (const topic of NEWS_TOPICS) {
    try {
      const content = await scrapeNews(topic);
      if (content.articles.length > 0) {
        results.push(content);
      }
      // Small delay to respect rate limits across all sources
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[Multi-Source] Error scraping news for ${topic.name}:`, error);
    }
  }
  
  console.log(`\n${"=".repeat(60)}\n  AGGREGATION COMPLETE: ${results.length}/${NEWS_TOPICS.length} topics successful\n${"=".repeat(60)}\n`);
  
  // Save to cache for future use
  await writeNewsCache(results);
  
  return results;
}
