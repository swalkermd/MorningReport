import { NewsContent } from "./openai";
import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";

// News topics configuration - refined for better search results
export const NEWS_TOPICS = [
  { name: "World News", query: "breaking world news today major events" },
  { name: "US News", query: "united states news headlines today" },
  { name: "Redlands CA Local News", query: "Redlands California news" },
  { name: "NBA", query: "NBA games highlights players standings" },
  { name: "AI & Machine Learning", query: "artificial intelligence breakthrough announcements today" },
  { name: "Electric Vehicles", query: "electric vehicle EV automotive news announcements" },
  { name: "Autonomous Driving", query: "self-driving autonomous vehicle technology news" },
  { name: "Humanoid Robots", query: "humanoid robot development boston dynamics tesla optimus" },
  { name: "eVTOL & Flying Vehicles", query: "eVTOL flying car urban air mobility news" },
  { name: "Tech Gadgets", query: "consumer technology gadget product launches 2025" },
  { name: "Anti-Aging Science", query: "longevity anti-aging research breakthrough" },
  { name: "Virtual Medicine", query: "telemedicine digital health technology news" },
  { name: "Travel", query: "travel industry airlines destinations news today" },
];

/**
 * Fetches news from Brave Search API
 * Primary search source with generous free tier (2,000 queries/month)
 */
async function scrapeNewsBraveSearch(topic: { name: string; query: string }): Promise<NewsContent> {
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
    
    const validArticles = data.web.results
      .filter((result: any) => {
        const hasTitle = result.title && result.title.length > 10;
        const hasDescription = result.description && result.description.length > 30;
        const hasUrl = result.url;
        return hasTitle && hasDescription && hasUrl;
      })
      .slice(0, 3)
      .map((result: any) => {
        // Normalize timestamp - Brave may return relative strings or ISO dates
        let publishedAt = new Date().toISOString();
        if (result.age) {
          try {
            const parsed = new Date(result.age);
            if (!isNaN(parsed.getTime())) {
              publishedAt = parsed.toISOString();
            }
          } catch {
            // Keep default timestamp if parsing fails
          }
        }
        
        return {
          title: result.title,
          summary: result.description,
          source: new URL(result.url).hostname.replace('www.', ''),
          url: result.url,
          publishedAt,
        };
      });
    
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
 * Fetches news from CurrentsAPI
 */
async function scrapeNewsCurrentsAPI(topic: { name: string; query: string }): Promise<NewsContent> {
  const apiKey = process.env.CURRENTS_API_KEY;
  
  if (!apiKey) {
    console.error(`[CurrentsAPI] API key not configured - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
  try {
    const response = await fetch(
      `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(topic.query)}&language=en&apiKey=${apiKey}`,
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
export async function scrapeNewsFromNewsAPI(topic: { name: string; query: string }): Promise<NewsContent> {
  const apiKey = process.env.NEWSAPI_KEY;
  
  if (!apiKey) {
    console.error(`[NewsAPI] API key not configured - skipping ${topic.name}`);
    return { topic: topic.name, articles: [] };
  }
  
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
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic.query)}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`,
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
 * Smart multi-source news scraping with intelligent fallback
 * Tries Brave Search → NewsAPI → CurrentsAPI in that order
 */
export async function scrapeNews(topic: { name: string; query: string }): Promise<NewsContent> {
  console.log(`\n[Multi-Source] Fetching news for: ${topic.name}`);
  
  // Try Brave Search first (primary source with generous free tier)
  const braveResult = await scrapeNewsBraveSearch(topic);
  if (braveResult.articles.length > 0) {
    console.log(`[Multi-Source] ✓ ${topic.name} - Using Brave Search (${braveResult.articles.length} articles)`);
    return braveResult;
  }
  
  // Fallback to NewsAPI
  console.log(`[Multi-Source] Brave Search failed for ${topic.name}, trying NewsAPI...`);
  const newsApiResult = await scrapeNewsFromNewsAPI(topic);
  if (newsApiResult.articles.length > 0) {
    console.log(`[Multi-Source] ✓ ${topic.name} - Using NewsAPI (${newsApiResult.articles.length} articles)`);
    return newsApiResult;
  }
  
  // Final fallback to CurrentsAPI
  console.log(`[Multi-Source] NewsAPI failed for ${topic.name}, trying CurrentsAPI...`);
  const currentsResult = await scrapeNewsCurrentsAPI(topic);
  if (currentsResult.articles.length > 0) {
    console.log(`[Multi-Source] ✓ ${topic.name} - Using CurrentsAPI (${currentsResult.articles.length} articles)`);
    return currentsResult;
  }
  
  // All sources failed
  console.error(`[Multi-Source] ✗ ${topic.name} - All sources failed (Brave Search + NewsAPI + CurrentsAPI)`);
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
