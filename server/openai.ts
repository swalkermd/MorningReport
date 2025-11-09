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
function analyzeTopicCoverage(newsContent: NewsContent[], previousReports: string[]): {
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
  // Filter out topics with no valid articles
  const validNewsContent = newsContent.filter(section => section.articles.length > 0);
  
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
    ? `\n\nPrevious 5 reports (avoid repeating this content unless there are significant updates):\n${previousReports.map((report, i) => `--- Report ${i + 1} ---\n${report}`).join("\n\n")}`
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

  const prompt = `You are a professional news anchor for NPR/BBC writing a daily morning news briefing. You MUST write at NATIONAL NEWS QUALITY LEVEL with SPECIFIC facts, names, numbers, and citations.

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
- MUST be 1500-2000 words (target length for 5-10 minute audio briefing)
- MINIMUM 1500 words - this is NON-NEGOTIABLE for proper audio duration
- Each topic should receive 2-3 paragraphs of coverage (150-200 words per topic)
- Include transitional phrases, context, and analysis to reach target length
- If you have 6-8 topics, aim for 200-250 words per topic to hit 1500+ total
- EVERY story MUST include SPECIFIC details: names, numbers, locations, dates, companies
- ABSOLUTELY NO vague phrases like "buzzing with activity", "seeing momentum", "noteworthy increase"
- REJECT generic content - if source data lacks specifics, skip that topic entirely
- DO NOT improvise your own closing - use the required closing line only
- Use current, accurate titles for political figures (e.g., "President", "President-elect", not outdated titles)

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
- Only cite sources when pertinent to the story's credibility or context
- Sources are NOT required for every piece of information
- When citing: use natural attribution (e.g., "according to Bloomberg", "Reuters reports")
- Include publication dates only when relevant to the story's timeliness

CONTENT SELECTION:
- PRIORITY TOPICS (prioritize these if notable): NBA, Redlands CA Local News
- TOPIC BALANCE: Each topic should appear at least once every 5 reports to ensure comprehensive coverage
- Only include stories with SPECIFIC, verifiable facts
- MUST have: organization/person name + number/metric + location/timeframe
- Skip any topic where source data is too vague or story isn't newsworthy
- Better to cover stories well than force inclusion of unremarkable content
- Focus on: major announcements, statistical changes, product launches, policy decisions
- If NBA or Redlands news is notable and meets quality standards, prioritize it
- Skip any topic (including priority topics) if the news isn't significant or lacks specifics${topicBalanceGuidance}

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
- NO editorializing or speculation

NEWS CONTENT BY TOPIC:
${newsContentStr}${previousReportsContext}

Write your news report now. Remember: 
1. SPECIFIC FACTS ONLY (names + numbers + dates)
2. Cite sources only when pertinent to the story
3. If a story can't meet quality standards, skip it entirely`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a professional news anchor writing daily audio news briefings. Write in a clear, engaging style suitable for spoken delivery.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_completion_tokens: 3500,
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
  
  // Validate report length
  const wordCount = content.split(/\s+/).length;
  console.log(`[Report Length] Generated ${wordCount} words (target: 1500-2000)`);
  
  if (wordCount < 1500) {
    console.warn(`[Report Length] WARNING: Report too short (${wordCount} words < 1500 minimum)`);
    // Could implement retry with extended prompt here in future iteration
  }

  return content;
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
