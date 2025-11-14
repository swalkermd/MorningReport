import { NewsContent } from "./openai";
import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";

// API usage tracking system for backup sources
const USAGE_TRACKING_DIR = path.join(process.cwd(), 'data');
const MEDIASTACK_USAGE_FILE = path.join(USAGE_TRACKING_DIR, 'mediastack-usage.json');
const CURRENTS_USAGE_FILE = path.join(USAGE_TRACKING_DIR, 'currents-usage.json');

// Rate limits
const MEDIASTACK_DAILY_LIMIT = 3;
const CURRENTS_DAILY_MINIMUM = 1; // Sample at least 1 call/day
const CURRENTS_MONTHLY_LIMIT = 600; // Free tier limit

interface ApiUsage {
  date: string;
  count: number;
}

async function getApiUsageToday(usageFile: string): Promise<number> {
  try {
    const data = await fs.readFile(usageFile, 'utf-8');
    const usage: ApiUsage = JSON.parse(data);
    const today = new Date().toISOString().split('T')[0];
    
    if (usage.date === today) {
      return usage.count;
    }
    return 0; // New day, reset counter
  } catch (error) {
    return 0; // File doesn't exist or error reading
  }
}

async function incrementApiUsage(usageFile: string, apiName: string, dailyLimit?: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const currentCount = await getApiUsageToday(usageFile);
  
  const usage: ApiUsage = {
    date: today,
    count: currentCount + 1
  };
  
  try {
    await fs.mkdir(path.dirname(usageFile), { recursive: true });
    await fs.writeFile(usageFile, JSON.stringify(usage, null, 2));
    
    if (dailyLimit) {
      console.log(`[${apiName}] Usage: ${usage.count}/${dailyLimit} calls today`);
    } else {
      console.log(`[${apiName}] Usage: ${usage.count} calls today`);
    }
  } catch (error) {
    console.error(`[${apiName}] Failed to update usage tracking:`, error);
  }
}

// Convenience wrappers
async function getMediaStackUsageToday(): Promise<number> {
  return getApiUsageToday(MEDIASTACK_USAGE_FILE);
}

async function incrementMediaStackUsage(): Promise<void> {
  return incrementApiUsage(MEDIASTACK_USAGE_FILE, 'MediaStack', MEDIASTACK_DAILY_LIMIT);
}

async function getCurrentsUsageToday(): Promise<number> {
  return getApiUsageToday(CURRENTS_USAGE_FILE);
}

async function incrementCurrentsUsage(): Promise<void> {
  return incrementApiUsage(CURRENTS_USAGE_FILE, 'CurrentsAPI');
}

// Topic freshness tiers
// Tier 1 (Breaking News): 24 hours - time-sensitive news that goes stale quickly
// Tier 2 (Tech/Science): 120 hours (5 days) - slower-moving tech/science stories
const FRESHNESS_TIERS = {
  breaking: 24,  // hours
  tech: 120,     // hours (5 days) - allows for weekend gaps in tech news
};

// News topics configuration with primary and simplified fallback queries
export const NEWS_TOPICS = [
  { name: "World News", query: "breaking world news today major events", fallbackQuery: "world news", freshness: FRESHNESS_TIERS.breaking },
  { name: "US News", query: "united states news headlines today", fallbackQuery: "USA news", freshness: FRESHNESS_TIERS.breaking },
  { name: "Redlands CA Local News", query: "Redlands California news", fallbackQuery: "Redlands news", freshness: FRESHNESS_TIERS.breaking },
  { name: "NBA", query: "NBA games highlights players", fallbackQuery: "NBA basketball", freshness: FRESHNESS_TIERS.breaking },
  { name: "AI & Machine Learning", query: "artificial intelligence AI machine learning", fallbackQuery: "AI technology", freshness: FRESHNESS_TIERS.tech },
  { name: "Electric Vehicles", query: "electric vehicle EV Tesla Rivian", fallbackQuery: "electric car", freshness: FRESHNESS_TIERS.tech },
  { name: "Autonomous Driving", query: "self-driving autonomous vehicle", fallbackQuery: "self driving car", freshness: FRESHNESS_TIERS.tech },
  { name: "Humanoid Robots", query: "humanoid robot Tesla Optimus", fallbackQuery: "robot technology", freshness: FRESHNESS_TIERS.tech },
  { name: "eVTOL & Flying Vehicles", query: "flying car urban air mobility", fallbackQuery: "electric aviation aircraft", freshness: FRESHNESS_TIERS.tech },
  { name: "Tech Gadgets", query: "consumer technology gadget smartphone", fallbackQuery: "new tech products", freshness: FRESHNESS_TIERS.tech },
  { name: "Anti-Aging Science", query: "longevity anti-aging research", fallbackQuery: "aging health research medicine", freshness: FRESHNESS_TIERS.tech },
  { name: "Virtual Medicine", query: "telemedicine digital health telehealth", fallbackQuery: "online healthcare medical technology", freshness: FRESHNESS_TIERS.tech },
  { name: "Travel", query: "travel industry airlines destinations", fallbackQuery: "travel news", freshness: FRESHNESS_TIERS.breaking },
];

/**
 * Fetches news from Brave Search API
 * Primary search source with generous free tier (2,000 queries/month)
 */
function parseBraveResult(
  result: any,
  freshnessHours: number,
  topicName: string
): { title: string; summary: string; source: string; url: string; publishedAt: string } | null {
  const hasTitle = result.title && result.title.length > 10;
  const hasDescription = result.description && result.description.length > 30;
  const hasUrl = result.url;

  if (!hasTitle || !hasDescription || !hasUrl) {
    return null;
  }

  let publishedAt: string | null = null;

  if (result.age) {
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
      try {
        const parsed = new Date(result.age);
        if (!isNaN(parsed.getTime())) {
          publishedAt = parsed.toISOString();
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  if (!publishedAt) {
    console.log(`[BraveSearch] Discarded article without parseable timestamp: "${result.title.substring(0, 50)}" (age: ${result.age})`);
    return null;
  }

  const publishedDate = new Date(publishedAt);
  const now = new Date();
  const ageHours = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);

  if (ageHours > freshnessHours) {
    console.log(`[BraveSearch] Discarded stale article (${ageHours.toFixed(1)}h old, max ${freshnessHours}h) for ${topicName}: "${result.title.substring(0, 50)}"`);
    return null;
  }

  return {
    title: result.title,
    summary: result.description,
    source: new URL(result.url).hostname.replace('www.', ''),
    url: result.url,
    publishedAt,
  };
}

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
      .map((result: any) => parseBraveResult(result, topic.freshness, topic.name))
      .filter((article: any): article is { title: string; summary: string; source: string; url: string; publishedAt: string } => Boolean(article));
    
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
    
    // Increment usage counter after successful API call
    await incrementCurrentsUsage();
    
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

const MIN_ARTICLES_PER_TOPIC = 2;
const MAX_ARTICLES_PER_TOPIC = 4;
const CURRENTS_DAILY_BUDGET = Math.floor(CURRENTS_MONTHLY_LIMIT / 30); // ≈20

function mergeArticles(
  target: any[],
  incoming: any[],
  sourceName: string,
  contributions: Record<string, number>
): number {
  let addedCount = 0;

  for (const article of incoming) {
    const isDupe = target.some(existing => isDuplicate(existing, article));
    if (!isDupe) {
      target.push(article);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    contributions[sourceName] = (contributions[sourceName] || 0) + addedCount;
  }
  return addedCount;
}

/**
 * Adaptive sampling strategy - escalates through sources until coverage goals are met
 * Starts with primary sources and only touches paid/limited APIs when needed
 */
export async function scrapeNews(topic: { name: string; query: string; freshness: number }): Promise<NewsContent> {
  console.log(`\n[Smart Sampling] Fetching news for: ${topic.name}`);

  const mergedArticles: any[] = [];
  const sourceContributions: Record<string, number> = {};

  const currentsUsage = await getCurrentsUsageToday();
  const mediastackUsage = await getMediaStackUsageToday();

  const integrateResult = (result: NewsContent, sourceLabel: string) => {
    if (result.articles.length === 0) {
      console.log(`[Smart Sampling] ${sourceLabel} returned no usable articles for ${topic.name}`);
      return;
    }
    const added = mergeArticles(mergedArticles, result.articles, sourceLabel, sourceContributions);
    console.log(`[Smart Sampling] ${sourceLabel} contributed ${added} new article(s) for ${topic.name}`);
  };

  // 1. Primary: Brave Search
  integrateResult(await scrapeNewsBraveSearch(topic), 'Brave');

  // 2. Primary backup: NewsAPI (only if still short on coverage)
  if (mergedArticles.length < MIN_ARTICLES_PER_TOPIC) {
    integrateResult(await scrapeNewsFromNewsAPI(topic), 'NewsAPI');
  } else {
    console.log(`[Smart Sampling] Skipping NewsAPI for ${topic.name} — already have ${mergedArticles.length} articles from Brave`);
  }

  // 3. CurrentsAPI only when necessary or to satisfy daily sampling minimum on flagship topic
  const shouldSampleCurrents =
    (mergedArticles.length < MIN_ARTICLES_PER_TOPIC && currentsUsage < CURRENTS_DAILY_BUDGET) ||
    (currentsUsage < CURRENTS_DAILY_MINIMUM && topic.name === 'World News');

  if (shouldSampleCurrents) {
    integrateResult(await scrapeNewsCurrentsAPI(topic), 'CurrentsAPI');
  } else {
    console.log(`[Smart Sampling] Skipping CurrentsAPI for ${topic.name} — usage ${currentsUsage}/${CURRENTS_DAILY_BUDGET}`);
  }

  // 4. MediaStack as last resort under strict daily limit
  const shouldCallMediaStack = mergedArticles.length < MIN_ARTICLES_PER_TOPIC && mediastackUsage < MEDIASTACK_DAILY_LIMIT;

  if (shouldCallMediaStack) {
    integrateResult(await scrapeNewsMediaStack(topic), 'MediaStack');
  } else if (mergedArticles.length >= MIN_ARTICLES_PER_TOPIC) {
    console.log(`[Smart Sampling] Skipping MediaStack for ${topic.name} — already satisfied with ${mergedArticles.length} article(s)`);
  } else {
    console.log(`[Smart Sampling] Skipping MediaStack for ${topic.name} — usage ${mediastackUsage}/${MEDIASTACK_DAILY_LIMIT}`);
  }

  if (mergedArticles.length === 0) {
    console.error(`[Smart Sampling] ✗ ${topic.name} - No articles from any source`);
    return { topic: topic.name, articles: [] };
  }

  const freshArticles = mergedArticles.filter(article => isArticleFresh(article, topic.freshness));

  if (freshArticles.length === 0) {
    console.warn(`[Smart Sampling] ✗ ${topic.name} - All ${mergedArticles.length} articles filtered as stale (>${topic.freshness}h)`);
    return { topic: topic.name, articles: [] };
  }

  const sortedArticles = freshArticles.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  const topArticles = sortedArticles.slice(0, MAX_ARTICLES_PER_TOPIC);

  const contributionLog = Object.entries(sourceContributions)
    .map(([source, count]) => `${source}:${count}`)
    .join(', ') || 'none';
  console.log(`[Smart Sampling] ✓ ${topic.name} - ${mergedArticles.length} unique → ${freshArticles.length} fresh → top ${topArticles.length} selected (${contributionLog})`);

  return {
    topic: topic.name,
    articles: topArticles
  };
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
  let attemptedFile = getCacheFilePath(date);
  try {
    let cacheFile = attemptedFile;

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
            attemptedFile = cacheFile;
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
    console.log(`[Cache] Miss for ${attemptedFile} - fetching fresh data`);
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
 * Retry a failed topic with simplified fallback query
 * Uses a simpler query string to increase chances of finding articles
 */
async function retryTopicWithFallbackQuery(topic: { name: string; query: string; fallbackQuery?: string; freshness: number }): Promise<NewsContent> {
  if (!topic.fallbackQuery) {
    console.log(`[Retry] No fallback query available for ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  console.log(`[Retry] Attempting ${topic.name} with simplified query: "${topic.fallbackQuery}"`);
  
  // Try with the simpler fallback query
  const fallbackTopic = { ...topic, query: topic.fallbackQuery };
  return await scrapeNews(fallbackTopic);
}

/**
 * Targeted Brave Search fallback for underrepresented topics
 * Uses Brave's general search with relaxed freshness to find ANY relevant content
 * Only called for topics that have been consistently missing from reports
 */
async function targetedBraveSearchFallback(topic: { name: string; query: string; fallbackQuery?: string; freshness: number }): Promise<NewsContent> {
  console.log(`[Targeted Fallback] Using Brave general search for underrepresented topic: ${topic.name}`);
  
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return { topic: topic.name, articles: [] };
  }
  
  try {
    // Use fallback query if available, otherwise primary query
    const searchQuery = topic.fallbackQuery || topic.query;
    
    // Use longer freshness window for underrepresented topics (7 days)
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery + " news")}&count=5&freshness=pw`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(10000)
      }
    );
    
    if (response.status === 429) {
      console.warn(`[Targeted Fallback] Rate limit hit for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    if (!response.ok) {
      return { topic: topic.name, articles: [] };
    }
    
    const data = await response.json();
    
    if (!data.web?.results || data.web.results.length === 0) {
      console.warn(`[Targeted Fallback] No results found for ${topic.name}`);
      return { topic: topic.name, articles: [] };
    }
    
    // Parse articles (same logic as regular Brave Search)
    const targetedFreshnessHours = Math.max(topic.freshness, 24 * 7);
    const articles = data.web.results
      .map((result: any) => parseBraveResult(result, targetedFreshnessHours, topic.name))
      .filter((article: ReturnType<typeof parseBraveResult>): article is NonNullable<ReturnType<typeof parseBraveResult>> => Boolean(article))
      .slice(0, 3)
      .map((article: NonNullable<ReturnType<typeof parseBraveResult>>) => ({
        ...article,
        source: article.source || "Brave Search"
      }));
    
    if (articles.length > 0) {
      console.log(`[Targeted Fallback] ✓ Found ${articles.length} articles for ${topic.name}`);
    }
    
    return {
      topic: topic.name,
      articles
    };
    
  } catch (error) {
    console.error(`[Targeted Fallback] Error for ${topic.name}:`, error);
    return { topic: topic.name, articles: [] };
  }
}

/**
 * Fetches all news with intelligent caching, retry logic, and targeted fallbacks
 * - Checks cache first
 * - Initial parallel scrape for all topics
 * - Sequential retry with simplified queries for failed topics
 * - Targeted fallback search for persistently underrepresented topics
 * @param forceRefresh - If true, bypasses cache and fetches fresh data
 * @param underrepresentedTopics - Topics that haven't been covered in last 5 reports (for targeted fallback)
 */
const MAX_CONCURRENT_TOPICS = 4;

export async function scrapeAllNews(forceRefresh: boolean = false, underrepresentedTopics: string[] = []): Promise<NewsContent[]> {
  // Check cache first unless forced refresh
  if (!forceRefresh) {
    const cached = await readNewsCache();
    if (cached) {
      console.log('[Cache] Using cached news data - no API calls made');
      return cached;
    }
  }
  
  const results: NewsContent[] = [];
  const failedTopics: typeof NEWS_TOPICS = [];
  
  console.log(`\n${"=".repeat(60)}\n  STARTING MULTI-SOURCE NEWS AGGREGATION\n${"=".repeat(60)}`);
  
  // PHASE 1: Initial scrape in small concurrent batches
  for (let i = 0; i < NEWS_TOPICS.length; i += MAX_CONCURRENT_TOPICS) {
    const batch = NEWS_TOPICS.slice(i, i + MAX_CONCURRENT_TOPICS);
    const batchResults = await Promise.all(batch.map(async (topic) => {
      try {
        const content = await scrapeNews(topic);
        return { topic, content };
      } catch (error) {
        console.error(`[Multi-Source] Error scraping news for ${topic.name}:`, error);
        return { topic, content: { topic: topic.name, articles: [] } };
      }
    }));

    for (const { topic, content } of batchResults) {
      if (content.articles.length > 0) {
        results.push(content);
      } else {
        failedTopics.push(topic);
      }
    }

    if (i + MAX_CONCURRENT_TOPICS < NEWS_TOPICS.length) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  
  console.log(`\n[Phase 1 Complete] ${results.length}/${NEWS_TOPICS.length} topics successful, ${failedTopics.length} failed`);
  
  // PHASE 2: Sequential retry with fallback queries for failed topics
  if (failedTopics.length > 0) {
    console.log(`\n[Phase 2] Retrying ${failedTopics.length} failed topics with simplified queries...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay before retries
    
    for (const topic of [...failedTopics]) {
      try {
        const content = await retryTopicWithFallbackQuery(topic);
        if (content.articles.length > 0) {
          results.push(content);
          // Remove from failed list
          const index = failedTopics.indexOf(topic);
          if (index > -1) failedTopics.splice(index, 1);
        }
        // Longer delay between retries to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[Retry] Error retrying ${topic.name}:`, error);
      }
    }
    
    console.log(`[Phase 2 Complete] ${results.length}/${NEWS_TOPICS.length} topics now successful`);
  }
  
  // PHASE 3: Targeted fallback for underrepresented topics still missing
  const stillMissingUnderrepresented = failedTopics.filter(t => 
    underrepresentedTopics.includes(t.name)
  );
  
  if (stillMissingUnderrepresented.length > 0) {
    console.log(`\n[Phase 3] Targeted fallback for ${stillMissingUnderrepresented.length} underrepresented topics...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay before targeted fallback

    // Limit to 5 targeted searches per run to preserve API quota while improving coverage
    const topicsToTarget = stillMissingUnderrepresented.slice(0, 5);
    
    for (const topic of topicsToTarget) {
      try {
        const content = await targetedBraveSearchFallback(topic);
        if (content.articles.length > 0) {
          results.push(content);
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`[Targeted Fallback] Error for ${topic.name}:`, error);
      }
    }
    
    console.log(`[Phase 3 Complete] Final count: ${results.length}/${NEWS_TOPICS.length} topics successful`);
  }
  
  console.log(`\n${"=".repeat(60)}\n  AGGREGATION COMPLETE: ${results.length}/${NEWS_TOPICS.length} topics successful\n${"=".repeat(60)}\n`);
  
  // Save to cache for future use
  await writeNewsCache(results);
  
  return results;
}
