import { NewsContent } from "./openai";

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
 * Fetches real news for a given topic using NewsAPI with robust error handling
 * Returns empty articles array if real news unavailable to prevent vague content
 */
export async function scrapeNews(topic: { name: string; query: string }): Promise<NewsContent> {
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

export async function scrapeAllNews(): Promise<NewsContent[]> {
  const results: NewsContent[] = [];
  
  // Fetch news for each topic sequentially to avoid rate limiting
  for (const topic of NEWS_TOPICS) {
    try {
      const content = await scrapeNews(topic);
      if (content.articles.length > 0) {
        results.push(content);
      }
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error scraping news for ${topic.name}:`, error);
    }
  }
  
  return results;
}
