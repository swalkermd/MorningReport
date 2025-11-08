import { NewsContent } from "./openai";

// News topics configuration - refined for better search results
export const NEWS_TOPICS = [
  { name: "World News", query: "breaking world news today major events" },
  { name: "US News", query: "united states news headlines today" },
  { name: "Local CA News", query: "southern california news san bernardino county today" },
  { name: "NBA", query: "NBA basketball news scores trades today" },
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
 * Fetches real news for a given topic using NewsAPI
 * Falls back to simulated data if API unavailable
 */
export async function scrapeNews(topic: { name: string; query: string }): Promise<NewsContent> {
  try {
    // Use NewsAPI if available
    const apiKey = process.env.NEWSAPI_KEY;
    
    if (apiKey) {
      const response = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic.query)}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.articles && data.articles.length > 0) {
          return {
            topic: topic.name,
            articles: data.articles.slice(0, 3).map((article: any) => ({
              title: article.title,
              summary: article.description || article.content?.substring(0, 200) || '',
              source: article.source.name,
              url: article.url,
              publishedAt: article.publishedAt,
            })),
          };
        }
      }
    }
    
    // Fallback: Return placeholder that indicates real news fetching needed
    console.log(`NewsAPI not available for ${topic.name}, using fallback`);
    return {
      topic: topic.name,
      articles: [{
        title: `Latest updates in ${topic.name}`,
        summary: `Search for: ${topic.query}`,
        source: "Aggregated",
      }],
    };
    
  } catch (error) {
    console.error(`Error fetching news for ${topic.name}:`, error);
    return {
      topic: topic.name,
      articles: [],
    };
  }
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
