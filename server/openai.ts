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
  
  const newsContentStr = validNewsContent
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

CRITICAL REQUIREMENTS:
- Start with EXACTLY: "Here's your morning report for ${formattedDate}."
- End with EXACTLY: "That's it for the morning report. Have a great day!"
- MUST be approximately 1000 words (target length for comprehensive audio briefing)
- EVERY story MUST include SPECIFIC details: names, numbers, locations, dates, companies
- ABSOLUTELY NO vague phrases like "buzzing with activity", "seeing momentum", "noteworthy increase"
- REJECT generic content - if source data lacks specifics, skip that topic entirely
- DO NOT improvise your own closing - use the required closing line only

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
- Only include stories with SPECIFIC, verifiable facts
- MUST have: organization/person name + number/metric + location/timeframe
- Skip any topic where source data is too vague or story isn't newsworthy
- Better to cover stories well than force inclusion of unremarkable content
- Focus on: major announcements, statistical changes, product launches, policy decisions
- If NBA or Redlands news is notable and meets quality standards, prioritize it
- Skip any topic (including priority topics) if the news isn't significant or lacks specifics

QUALITY VALIDATION (each story must pass):
✅ Contains at least ONE specific organization/person name
✅ Contains at least ONE specific number, percentage, or metric
✅ Contains at least ONE specific location, date, or timeframe

DELIVERY STYLE:
- Professional but conversational (NPR/BBC style)
- Short sentences for audio clarity
- Smooth transitions between unrelated topics
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
    max_completion_tokens: 2500,
  });

  const content = response.choices[0].message.content || "";
  
  if (!content || content.trim().length === 0) {
    throw new Error("OpenAI returned an empty response");
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
