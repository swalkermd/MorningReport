import OpenAI from "openai";
import fs from "fs";
import path from "path";

// the newest OpenAI model is "gpt-4o" which is the most capable model available
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface NewsContent {
  topic: string;
  articles: Array<{
    title: string;
    summary: string;
    source: string;
    url?: string;
    publishedAt?: string;
  }>;
}

/**
 * Analyzes previous reports to determine which topics haven't been covered recently
 * Ensures balanced coverage across all topics over a 5-report cycle
 */
export function analyzeTopicCoverage(newsContent: NewsContent[], previousReports: string[]): {
  underrepresentedTopics: string[];
  topicCoverageSummary: string;
} {
  if (previousReports.length === 0) {
    return { 
      underrepresentedTopics: [],
      topicCoverageSummary: ""
    };
  }

  // Extract all available topic names from newsContent
  const allTopics = newsContent.map(nc => nc.topic);
  
  // Count how many times each topic appears in previous reports
  const topicMentions: Map<string, number> = new Map();
  allTopics.forEach(topic => topicMentions.set(topic, 0));
  
  // Scan previous reports for topic coverage
  previousReports.forEach(report => {
    allTopics.forEach(topic => {
      // Check if topic name or key terms appear in the report
      const topicTerms = topic.toLowerCase();
      if (report.toLowerCase().includes(topicTerms)) {
        topicMentions.set(topic, (topicMentions.get(topic) || 0) + 1);
      }
    });
  });
  
  // Identify topics not covered in any of the last 5 reports
  const underrepresentedTopics = allTopics.filter(topic => 
    (topicMentions.get(topic) || 0) === 0
  );
  
  // Create summary for logging and prompt
  const coverageSummary = Array.from(topicMentions.entries())
    .sort((a, b) => a[1] - b[1]) // Sort by coverage count (least to most)
    .map(([topic, count]) => `${topic}: ${count}/${previousReports.length}`)
    .join(", ");
  
  return {
    underrepresentedTopics,
    topicCoverageSummary: coverageSummary
  };
}

// Keywords that may trigger safety filters - used for retry fallback only
const SENSITIVE_KEYWORDS = [
  'dismembered', 'beheaded', 'mutilated', 'decapitated',
  'massacre', 'slaughtered', 'tortured', 'executed',
  'bodies found', 'remains discovered', 'corpse'
];

/**
 * Detects if an article is a generic portal/homepage without actual news content
 * These articles cause GPT to hallucinate details to fill content gaps
 */
function isGenericPortalArticle(article: { title: string; summary: string; url?: string }): boolean {
  const title = article.title.toLowerCase();
  const summary = article.summary.toLowerCase();
  const url = (article.url || '').toLowerCase();
  
  // Generic portal keywords that appear in titles
  const genericKeywords = ['news', 'scores', 'updates', 'coverage', 'analysis', 'standings', 'playoff'];
  
  // Count how many generic keywords appear in the title
  const genericKeywordCount = genericKeywords.filter(keyword => title.includes(keyword)).length;
  
  // Additional strong indicators of generic portals
  const strongPortalIndicators = [
    /\|/,  // Pipe separator (e.g., "NBA News | Sports Illustrated")
    /breaking news/,
    /latest news/,
    /up-to-the-minute/,
    /complete coverage/,
    /expert analysis/,
    /game scores/,
  ];
  
  const hasStrongPortalIndicator = strongPortalIndicators.some(pattern => pattern.test(title));
  
  // Portal/homepage URL patterns
  const portalUrlPatterns = [
    /\/(nba|sports|news|technology|health)\/?$/,  // Category homepage
    /\/index\.(html?|php)$/,                       // Index pages
    /^https?:\/\/[^\/]+\/?$/,                      // Root domain
  ];
  
  // Generic summary indicators (no specific story details)
  const genericSummaryPatterns = [
    /^(up-to-the-minute|complete|comprehensive|latest)\s+(news|coverage|analysis)/,
    /players like.*still bring/,  // Generic player mentions without specific story
    /veterans? like/,
    /younger players? like/,
  ];
  
  // Check URL patterns
  const isPortalUrl = portalUrlPatterns.some(pattern => pattern.test(url));
  
  // Check summary patterns
  const hasGenericSummary = genericSummaryPatterns.some(pattern => pattern.test(summary));
  
  // An article is generic if:
  // - It has 2+ generic keywords in the title (e.g., "NBA News, Scores & Expert Analysis")
  // - OR it has a strong portal indicator in the title
  // - OR it has both a portal URL and a generic summary
  const isGeneric = 
    (genericKeywordCount >= 2) ||
    hasStrongPortalIndicator ||
    (isPortalUrl && hasGenericSummary);
  
  if (isGeneric) {
    console.warn(`[Portal Filter] Filtered generic portal article: "${article.title.substring(0, 60)}..." from ${article.url || 'unknown source'}`);
    console.warn(`[Portal Filter]   Reasons: keywords=${genericKeywordCount}, strongIndicator=${hasStrongPortalIndicator}, portalUrl=${isPortalUrl}, genericSummary=${hasGenericSummary}`);
  }
  
  return isGeneric;
}

/**
 * Filters out generic portal/homepage articles that lack specific news content
 * Prevents GPT from hallucinating details to fill content gaps
 */
function filterGenericPortalArticles(newsContent: NewsContent[]): NewsContent[] {
  return newsContent.map(topic => ({
    ...topic,
    articles: topic.articles.filter(article => !isGenericPortalArticle(article))
  })).filter(topic => topic.articles.length > 0);
}

/**
 * Filters out articles containing highly graphic terms
 * Used as fallback when GPT refuses to generate content
 */
function filterSensitiveArticles(newsContent: NewsContent[]): NewsContent[] {
  return newsContent.map(topic => ({
    ...topic,
    articles: topic.articles.filter(article => {
      const combined = `${article.title} ${article.summary}`.toLowerCase();
      const hasSensitiveContent = SENSITIVE_KEYWORDS.some(keyword => 
        combined.includes(keyword.toLowerCase())
      );
      
      if (hasSensitiveContent) {
        console.warn(`[Content Filter] Filtered sensitive article: "${article.title.substring(0, 60)}..."`);
      }
      
      return !hasSensitiveContent;
    })
  })).filter(topic => topic.articles.length > 0);
}

export async function generateNewsReport(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date
): Promise<string> {
  // CRITICAL: Filter out generic portal/homepage articles BEFORE generation
  // This prevents GPT from hallucinating details to fill content gaps
  const filteredNewsContent = filterGenericPortalArticles(newsContent);
  console.log(`[Portal Filter] Filtered from ${newsContent.length} to ${filteredNewsContent.length} topics after removing generic portals`);
  
  // Filter out topics with no valid articles
  const validNewsContent = filteredNewsContent.filter(section => section.articles.length > 0);
  
  if (validNewsContent.length === 0) {
    throw new Error('No valid news articles available - cannot generate quality report');
  }
  
  // Try generation with full content first
  try {
    return await attemptGenerateReport(validNewsContent, previousReports, reportDate);
  } catch (error: any) {
    // Check if response contains content refusal
    const errorMessage = error?.message || '';
    const responseContent = error?.response?.choices?.[0]?.message?.content || '';
    const isContentRefusal = errorMessage.includes("can't provide") || 
                            errorMessage.includes("cannot provide") ||
                            responseContent.includes("I'm sorry, but I can't provide");
    
    if (isContentRefusal) {
      console.warn('[GPT Refusal] Content policy triggered, retrying with filtered content...');
      const filteredContent = filterSensitiveArticles(validNewsContent);
      
      if (filteredContent.length === 0) {
        throw new Error("All articles filtered out due to sensitive content - cannot generate report");
      }
      
      console.log(`[GPT Retry] Retrying with ${filteredContent.length} topics after filtering sensitive content`);
      return await attemptGenerateReport(filteredContent, previousReports, reportDate);
    }
    
    // Re-throw if it's not a content refusal
    throw error;
  }
}

async function attemptGenerateReport(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date
): Promise<string> {
  // Try up to 2 attempts to generate a properly-sized report
  const maxAttempts = 2;
  let lastWordCount = 0;
  const topicCount = newsContent.length;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isRetry = attempt > 1;
    
    try {
      const report = await generateReportAttempt(
        newsContent,
        previousReports,
        reportDate,
        isRetry ? lastWordCount : undefined
      );
      
      // Validate length
      const wordCount = report.split(/\s+/).length;
      console.log(`[Report Length] Generated ${wordCount} words (target: 1800-2000) [attempt ${attempt}/${maxAttempts}]`);

      // Flexible length requirements: Prioritize accuracy over word count
      // A shorter accurate report is better than a longer hallucinated one
      const ABSOLUTE_MINIMUM = 700; // Reduced from 1200 to allow accurate but shorter reports
      const IDEAL_TARGET = 1800;

      console.log(`[Report Length] Minimum: ${ABSOLUTE_MINIMUM} words, Target: ${IDEAL_TARGET} words (${topicCount} topics)`);

      if (wordCount >= IDEAL_TARGET) {
        console.log(`[Report Length] ✓ Excellent length: ${wordCount} words`);
        return report;
      } else if (wordCount >= ABSOLUTE_MINIMUM) {
        console.warn(`[Report Length] ⚠ Acceptable: ${wordCount} words (target: ${IDEAL_TARGET}, but accuracy > length)`);
        return report;
      }
      
      // Report too short - prepare for retry
      lastWordCount = wordCount;
      console.warn(`[Report Length] ⚠️  Report too short (${wordCount} words < ${ABSOLUTE_MINIMUM} minimum, target: ${IDEAL_TARGET})`);

      if (attempt < maxAttempts) {
        console.log(`[Report Length] Retrying with expansion instructions...`);
      } else {
        console.error(`[Report Length] ❌ Failed to generate ${ABSOLUTE_MINIMUM}+ word report after ${maxAttempts} attempts`);
        throw new Error(`Report generation failed: only ${wordCount} words after ${maxAttempts} attempts (minimum: ${ABSOLUTE_MINIMUM}, target: ${IDEAL_TARGET})`);
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      // For non-length errors, rethrow immediately
      if (!(error instanceof Error) || !error.message.includes('Report generation failed')) {
        throw error;
      }
    }
  }
  
  throw new Error('Report generation failed after all attempts');
}

async function generateReportAttempt(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date,
  previousWordCount?: number
): Promise<string> {
  // Analyze topic coverage in previous reports
  const { underrepresentedTopics, topicCoverageSummary } = analyzeTopicCoverage(
    newsContent, 
    previousReports
  );
  
  if (topicCoverageSummary) {
    console.log(`[Topic Coverage] ${topicCoverageSummary}`);
  }
  
  if (underrepresentedTopics.length > 0) {
    console.log(`[Topic Balance] Underrepresented topics (0 mentions in last ${previousReports.length} reports): ${underrepresentedTopics.join(', ')}`);
  }
  
  const newsContentStr = newsContent
    .map((section) => {
      const articlesStr = section.articles
        .map((article) => {
          const publishDate = article.publishedAt 
            ? new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '';
          return `- HEADLINE: ${article.title}\n  DETAILS: ${article.summary}\n  SOURCE: ${article.source}${publishDate ? ` (${publishDate})` : ''}`;
        })
        .join("\n\n");
      return `## ${section.topic}\n\n${articlesStr}`;
    })
    .join("\n\n");

  const previousReportsContext = previousReports.length > 0
    ? `\n\n🚨 CRITICAL ANTI-REPETITION REQUIREMENT 🚨

PREVIOUS 5 REPORTS (DO NOT REPEAT THESE STORIES):
${previousReports.map((report, i) => `--- Report ${i + 1} ---\n${report}`).join("\n\n")}

📋 REPETITION POLICY (STRICTLY ENFORCED):
1. DO NOT cover the same story/event from previous reports UNLESS there is a NEW development
2. A "NEW development" means:
   ✅ A new action taken (e.g., company announced → company launched)
   ✅ New numbers/data released (e.g., Q3 results → Q4 results)
   ✅ New follow-up event (e.g., announcement → product ships)
   ✅ Breaking update to ongoing story (e.g., investigation → arrest made)
   
3. NOT acceptable as "new development":
   ❌ Same story with slightly different wording
   ❌ General progress on previously covered topics
   ❌ Continuation of same trend without new data points
   ❌ "Still happening" or "ongoing" without specific new facts
   
4. REQUIRED for any repeat story:
   - MUST explicitly state what's NEW (e.g., "In an update to yesterday's story...")
   - MUST include NEW specific facts (names, numbers, dates) not in previous reports
   - MUST represent meaningful progression, not just restatement
   
5. When in doubt: SKIP the story and find fresh news instead
   - It's better to have 6 fresh topics than 8 topics with 2 repeats
   - Listeners expect DIFFERENT news each day, not reruns

❌ EXAMPLE OF VIOLATION:
Previous report: "Tesla announced new battery technology with 30% range improvement"
Today's report: "Tesla continues progress on battery technology improvements" ← REJECT THIS

✅ EXAMPLE OF ACCEPTABLE REPEAT:
Previous report: "Tesla announced new battery technology with 30% range improvement"
Today's report: "Tesla began production of its new battery cells at the Texas Gigafactory, shipping first units to customers this week" ← NEW ACTION, NEW FACTS`
    : "";
  
  // Build topic balance guidance
  const topicBalanceGuidance = underrepresentedTopics.length > 0
    ? `\n\n🎯 TOPIC COVERAGE REQUIREMENT:
The following topics have NOT appeared in the last ${previousReports.length} reports and MUST be included in today's report if they have newsworthy content with specific facts:
${underrepresentedTopics.map(t => `- ${t}`).join('\n')}

To ensure balanced coverage, prioritize these underrepresented topics when selecting stories. Every topic should appear at least once every 5 reports.`
    : "";

  // Format date for the intro (e.g., "Monday, November 8th, 2025")
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const dayName = dayNames[reportDate.getDay()];
  const monthName = monthNames[reportDate.getMonth()];
  const day = reportDate.getDate();
  const year = reportDate.getFullYear();
  
  // Add ordinal suffix (st, nd, rd, th)
  const getOrdinalSuffix = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };
  
  const formattedDate = `${dayName}, ${monthName} ${day}${getOrdinalSuffix(day)}, ${year}`;

  // Calculate required words per topic
  const topicCount = newsContent.length;
  const wordsPerTopic = Math.ceil(1800 / topicCount); // Aim for 1800 words total
  
  // Build retry-specific expansion instruction if this is a retry attempt
  const retryExpansionPrompt = previousWordCount ? `
🚨🚨🚨 PREVIOUS ATTEMPT FAILED: Only ${previousWordCount} words (REJECTED) 🚨🚨🚨

MATHEMATICAL BREAKDOWN:
Topics: ${topicCount}
Target: 1800 words minimum
Per topic: ${wordsPerTopic} words minimum

EXPANSION CHECKLIST (MANDATORY FOR EACH TOPIC):
□ Background/context paragraph with factual details from sources (60-80 words)
□ Detailed facts from sources: names, numbers, dates, locations (80-100 words)
□ Additional factual context and specific details from sources (60-80 words)
□ Transitional phrase to next topic (10-20 words)

MANDATORY EXPANSION TECHNIQUES:
1. START each topic with factual context/background from the sources (1 paragraph)
2. DETAIL the specific facts from source articles (2 paragraphs)
3. ADD more factual details from sources: names, dates, numbers, locations, specific events
4. ADD transitional phrases between topics
5. INCLUDE all relevant factual details from sources
6. ELABORATE with additional facts from the source articles, NOT speculation

DO NOT write brief summaries. This is a COMPREHENSIVE 5-10 minute audio briefing.
YOUR PREVIOUS ${previousWordCount}-WORD DRAFT WAS TOO SHORT. Write ${wordsPerTopic}+ words for EACH topic NOW.
` : `

📊 LENGTH REQUIREMENT (STRICTLY ENFORCED):
You have ${topicCount} topics. You MUST write ${wordsPerTopic}+ words PER TOPIC to reach the 1800-2000 word target.
- That means 3-4 full paragraphs per topic (200-250 words each)
- Include factual context, detailed facts, and additional relevant details from sources
- This is a comprehensive 5-10 minute audio briefing, not a headline summary
`;

  const prompt = `You are a professional news anchor for NPR/BBC writing a daily morning news briefing. You MUST write at NATIONAL NEWS QUALITY LEVEL with SPECIFIC facts, names, and numbers.${retryExpansionPrompt}

🚨🚨🚨 ANTI-HALLUCINATION POLICY (ABSOLUTE REQUIREMENT) 🚨🚨🚨

YOU MUST ONLY USE INFORMATION EXPLICITLY STATED IN THE PROVIDED SOURCE ARTICLES.

FORBIDDEN ACTIONS (IMMEDIATE DISQUALIFICATION):
❌ NEVER fabricate games, scores, or events not in source articles
❌ NEVER add player names, statistics, or details not explicitly mentioned in sources
❌ NEVER invent quotes, numbers, or facts to fill word count
❌ NEVER use your training data knowledge to supplement missing information
❌ NEVER make assumptions about who is coaching, playing, or leading organizations
❌ NEVER describe events as if you witnessed them when sources don't provide those details

REQUIRED ACTIONS (MANDATORY):
✅ ONLY report facts explicitly stated in the provided source articles
✅ If a source article is a generic portal/homepage (e.g., "NBA News, Scores & Expert Analysis"), it contains NO newsworthy information - SKIP that topic entirely
✅ If an article lacks specific details (names, numbers, dates), SKIP that topic
✅ If you cannot write a story using ONLY the provided source information, DO NOT write about that topic
✅ Better to skip a topic than to make up information
✅ If sources contradict each other, skip that story entirely
✅ If you're unsure whether something is in the source, DON'T include it

VERIFICATION CHECKLIST for EVERY fact you write:
□ Is this specific fact explicitly stated in a source article?
□ Did the source article provide the name/number/date I'm writing?
□ Am I copying information from the source, not from my training data?
□ If the source is vague or generic, am I skipping this topic?

EXAMPLES OF VIOLATIONS:
Source: "NBA News, Scores & Expert Analysis | Sports Illustrated"
❌ WRONG: "The Lakers defeated the Heat 112-108 last night with LeBron James leading..."
✅ CORRECT: Skip this topic - the source is a generic portal with no game details

Source: "Tesla continues work on battery technology"
❌ WRONG: "Tesla CEO Elon Musk announced a 30% range improvement at the Texas facility..."
✅ CORRECT: Only include facts the article explicitly states, or skip if too vague

SENSITIVE CONTENT POLICY:
- You MUST cover crime, violence, and other difficult news topics professionally
- Use neutral, factual tone without graphic details
- Focus on facts: who, what, where, when, why
- Avoid sensationalism while maintaining editorial integrity
- Example: "Authorities in Dubai are investigating after the remains of two individuals were discovered" instead of graphic descriptions

CRITICAL REQUIREMENTS:
- Start with EXACTLY: "Here's your morning report for ${formattedDate}."
- Include a brief "On This Day in History" section (1-2 sentences) near the end, before the closing
- End with EXACTLY: "That's it for the morning report. Have a great day!"
- TARGET: 1800-2000 words for a comprehensive 5-10 minute audio briefing
- MINIMUM: 700 words (but ACCURACY always trumps length - a 500-word accurate report beats a 2000-word fabricated one)
- Each topic SHOULD receive 3-4 paragraphs (200-250 words) IF sources provide sufficient detail
- If sources are insufficient, write less or skip the topic entirely - NEVER fabricate to meet word count
- EVERY story MUST include SPECIFIC details: names, numbers, locations, dates, companies
- ABSOLUTELY NO vague phrases like "buzzing with activity", "seeing momentum", "noteworthy increase"
- REJECT generic content - if source data lacks specifics, skip that topic entirely
- DO NOT improvise your own closing - use the required closing line only
🚨 CRITICAL FACT-CHECKING REQUIREMENT (MANDATORY):
- You MUST fact-check and CORRECT all political titles, even when source articles are wrong
- As of November 2025: Donald Trump is President of the United States (inaugurated January 2025)
- If a source article says "former President Trump" - this is INCORRECT and you MUST correct it to "President Trump"
- DO NOT copy outdated/incorrect titles from sources - always use current, factually accurate titles
- When writing about Trump in November 2025, refer to him as "President Trump" or "President Donald Trump"
- This applies to ALL political figures - verify current officeholders and correct source errors

🔴 FRESHNESS REQUIREMENT (CRITICAL):
- Breaking news topics (World, US, NBA, Redlands, Travel): ONLY stories from last 24 hours
- Tech/Science topics (AI, EVs, Robotics, Anti-Aging, eVTOL, etc.): Stories from last 3-4 days acceptable
- Check publication dates in source metadata - respect the tiered freshness windows
- For sports (NBA): Only include games/events from yesterday or today
- For tech announcements: Recent launches/updates within the past few days
- Better to skip a topic entirely than include genuinely stale news

NATIONAL NEWS QUALITY STANDARDS:
- Include SPECIFIC names (people, companies, organizations)
- Include NUMBERS (percentages, amounts, statistics)
- Include LOCATIONS (cities, countries, regions)
- Include TIMEFRAMES (yesterday, this week, Q4 results)
- Cite ACTUAL events, announcements, or developments
- Use ACTIVE voice with concrete details

FORBIDDEN PHRASES (causes immediate failure):
❌ "buzzing with activity"
❌ "seeing new momentum"
❌ "noteworthy increase"
❌ "industry experts are enthusiastic"
❌ "recent breakthroughs"
❌ "may soon be"
❌ ANY vague generalization without specific facts

REQUIRED FORMAT for each story:
✅ "[Company/Person] announced [specific thing] on [date/timeframe]"
✅ "[Metric] increased/decreased by [number]% in [location/sector]"
✅ "[Organization] launched [specific product/initiative] featuring [details]"

CITATION REQUIREMENTS:
- DO NOT cite sources in the report
- NO attribution phrases like "according to", "Reuters reports", etc.
- NO publication dates or source references
- Simply state the facts directly as a news anchor would

CONTENT SELECTION (ACCURACY > WORD COUNT):
- 🚨 MOST IMPORTANT STORY FIRST: For each topic, identify and report the MOST SIGNIFICANT/BREAKING story
  - Major product launches (e.g., "OpenAI releases new LLM model") > minor updates
  - Breaking announcements > ongoing developments
  - Industry-changing news > incremental progress
  - Ask yourself: "What's the BIGGEST news in this topic area today?"
  - Example: If OpenAI released a new LLM model yesterday, that's MAJOR AI news and MUST be covered
  - Skip smaller stories if a major story exists in the same topic
- PRIORITY TOPICS (prioritize these if notable): NBA, Redlands CA Local News
- TOPIC BALANCE: Each topic should appear at least once every 5 reports to ensure comprehensive coverage
- Only include stories with SPECIFIC, verifiable facts
- MUST have: organization/person name + number/metric + location/timeframe
- Skip any topic where source data is too vague or story isn't newsworthy
- 🚨 CRITICAL: Better to skip topics and have a shorter report than to fabricate information
- 🚨 ACCURACY ALWAYS TRUMPS WORD COUNT - a 1000-word accurate report is better than a 2000-word hallucinated report
- If you can only find verifiable information for 6-8 topics, write ONLY about those topics
- Focus on: major announcements, statistical changes, product launches, policy decisions
- If NBA or Redlands news is notable and meets quality standards, prioritize it
- Skip any topic (including priority topics) if the news isn't significant or lacks specifics
- If a topic has only generic portal links with no actual news stories, SKIP it entirely${topicBalanceGuidance}

ON THIS DAY IN HISTORY:
- After covering the main news topics, include a brief "On This Day in History" segment
- MUST be 1-2 sentences only
- State an interesting, specific historical event that occurred on ${monthName} ${day}
- Include the YEAR and specific FACTS (names, numbers, locations)
- Example format: "On this day in [YEAR], [specific event with names and details]."
- Keep it concise and factual - this is a brief transition before the closing

QUALITY VALIDATION (each story must pass):
✅ Contains at least ONE specific organization/person name
✅ Contains at least ONE specific number, percentage, or metric
✅ Contains at least ONE specific location, date, or timeframe

DELIVERY STYLE:
- Professional but conversational (NPR/BBC style)
- Short sentences for audio clarity
- Smooth transitions between topics WITHOUT stating topic names as headers
- DO NOT say "World News", "NBA", "Electric Vehicles", etc. as section titles
- Instead, incorporate topic transitions naturally into the first sentence:
  ✅ "In international developments, the United Nations..."
  ✅ "Turning to professional basketball, the Dallas Mavericks..."
  ✅ "On the automotive front, Tesla announced..."
  ❌ "World News. The United Nations..."
  ❌ "NBA. The Dallas Mavericks..."

🚨 STRICTLY PROHIBITED - NO EDITORIALIZATION:
- DO NOT add your own analysis, opinions, or interpretation
- DO NOT speculate about future implications or what "might" happen
- DO NOT editorialize or add commentary beyond the facts
- DO NOT use phrases like "this could signal", "this may indicate", "experts believe"
- Simply report what happened - names, numbers, dates, facts
- Let the facts speak for themselves without editorial framing

NEWS CONTENT BY TOPIC:
${newsContentStr}${previousReportsContext}

Write your news report now. Remember: 
1. SELECT THE MOST IMPORTANT/BREAKING story for each topic area
2. SPECIFIC FACTS ONLY (names + numbers + dates) - NO editorialization or speculation
3. DO NOT cite sources or include attribution phrases
4. If a story can't meet quality standards, skip it entirely
5. DO NOT REPEAT stories from previous reports unless there's a NEW development with NEW facts`;

  // Enhanced system message with non-negotiable requirements
  const systemMessage = `You are a professional news anchor writing comprehensive daily audio news briefings for Morning Report.

🔴 ABSOLUTE REQUIREMENTS (RANKED BY PRIORITY):

1. ACCURACY (HIGHEST PRIORITY - NEVER COMPROMISE):
   🚨 ONLY use information explicitly stated in source articles
   🚨 NEVER fabricate facts, statistics, names, or events
   🚨 If a source is a generic portal/homepage, SKIP that topic
   🚨 Better to skip topics than to make up information
   🚨 ACCURACY ALWAYS TRUMPS WORD COUNT

2. STRUCTURE:
   - Start EXACTLY: "Here's your morning report for [date]."
   - End EXACTLY: "That's it for the morning report. Have a great day!"
   - Include "On This Day in History" (1-2 sentences) before closing

3. QUALITY: Every story requires specific names, numbers, locations, dates - NO generic phrases
   - If sources don't provide specifics, SKIP that topic

4. LENGTH: TARGET 1800-2000 words for a comprehensive 5-10 minute audio briefing
   - MINIMUM 700 words (but can be shorter if that's all the verifiable information available)
   - CRITICAL: ACCURACY > LENGTH. A 500-word accurate report is better than a 2000-word fabricated report
   - Write 3-4 FULL paragraphs (200-250 words) per topic ONLY when sources provide sufficient detail
   - If sources are insufficient, write less or skip topics - NEVER invent facts to reach word count

5. FRESHNESS: DO NOT repeat stories from previous 5 reports unless there's a genuinely NEW development
   - Listeners expect DIFFERENT news each day, not rehashed content
   - When in doubt, skip the story and find fresh news instead

6. STYLE: Professional NPR/BBC quality - conversational but detailed and authoritative

PRIORITY ORDER: Accuracy > Quality > Structure > Freshness > Length`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_completion_tokens: 6000, // Increased to 6000 to support 1800-2000 word reports (~2667 tokens + 30% buffer)
  });

  const content = response.choices[0].message.content || "";
  
  if (!content || content.trim().length === 0) {
    throw new Error("OpenAI returned an empty response");
  }
  
  // Detect content refusal in response
  if (content.includes("I'm sorry, but I can't provide") || 
      content.includes("I cannot provide") ||
      content.includes("I'm unable to")) {
    const error: any = new Error("GPT refused to generate content due to content policy");
    error.response = { choices: [{ message: { content } }] };
    throw error;
  }
  
  // Apply political title corrections (deterministic post-processing)
  const correctedContent = validateAndCorrectPoliticalTitles(content);

  return correctedContent;
}

/**
 * Validates and automatically corrects incorrect political titles in the report.
 * Throws an error if unknown title violations are detected after corrections.
 */
function validateAndCorrectPoliticalTitles(content: string): string {
  let corrected = content;
  let correctionsMade = 0;
  
  // As of November 2025, Trump is the current president (inaugurated January 2025)
  // Replace all instances of "former President Trump" with "President Trump"
  const formerTrumpRegex = /(f|F)ormer (P|p)resident (Donald )?Trump/g;
  const matches = content.match(formerTrumpRegex);
  
  if (matches && matches.length > 0) {
    corrected = corrected.replace(formerTrumpRegex, (match) => {
      // Preserve the capitalization of "President"
      const isCapitalized = match.includes('President');
      return match.replace(/former /i, '').replace(/Former /i, '');
    });
    correctionsMade = matches.length;
    console.log(`[Title Validator] ✓ Corrected ${correctionsMade} instance(s) of "former President Trump" → "President Trump"`);
  }
  
  // Add more title corrections here as needed for other political figures
  // Example: corrected = corrected.replace(/Vice President-elect/g, 'Vice President');
  
  return corrected;
}

function splitTextIntoChunks(text: string, maxChars: number = 4000): string[] {
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const testChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    
    if (testChunk.length <= maxChars) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = '';
      
      if (paragraph.length > maxChars) {
        const sentences = paragraph.split('. ');
        let sentenceChunk = '';
        
        for (const sentence of sentences) {
          if (sentence.trim().length === 0) continue;
          
          const testSentence = sentenceChunk ? `${sentenceChunk}. ${sentence}` : sentence;
          
          if (testSentence.length <= maxChars) {
            sentenceChunk = testSentence;
          } else {
            if (sentenceChunk) {
              chunks.push(sentenceChunk);
              sentenceChunk = '';
            }
            
            if (sentence.length > maxChars) {
              let remaining = sentence;
              while (remaining.length > maxChars) {
                chunks.push(remaining.substring(0, maxChars));
                remaining = remaining.substring(maxChars);
              }
              if (remaining.trim().length > 0) {
                sentenceChunk = remaining;
              }
            } else {
              sentenceChunk = sentence;
            }
          }
        }
        
        if (sentenceChunk.trim().length > 0) {
          currentChunk = sentenceChunk;
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}

export async function generateAudioFromText(
  text: string,
  baseOutputPath: string
): Promise<string[]> {
  const chunks = splitTextIntoChunks(text, 4000);
  const audioPaths: string[] = [];
  const tempPaths: string[] = [];
  
  const dir = path.dirname(baseOutputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = chunks.length > 1 
        ? baseOutputPath.replace('.mp3', `-part${i + 1}.mp3`)
        : baseOutputPath;
      
      const tempPath = `${chunkPath}.tmp`;
      tempPaths.push(tempPath);
      
      const mp3 = await openai.audio.speech.create({
        model: "tts-1-hd",
        voice: "nova",
        input: chunks[i],
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      fs.writeFileSync(tempPath, buffer);
      
      fs.renameSync(tempPath, chunkPath);
      audioPaths.push(chunkPath);
    }

    return audioPaths;
  } catch (error) {
    for (const tempPath of tempPaths) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
    
    for (const audioPath of audioPaths) {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
    
    throw error;
  }
}
