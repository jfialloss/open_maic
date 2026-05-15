/**
 * Virtual Google Web Search via Gemini Grounding
 *
 * Simulates a web search API using Gemini 1.5/3.0 Flash with native Google Search Grounding.
 */

import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { WebSearchResult, WebSearchSource } from '@/lib/types/web-search';
import { createLogger } from '@/lib/logger';

const log = createLogger('GoogleVirtualSearch');

export async function searchWithGoogleVirtual(params: {
  query: string;
  apiKey?: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const { query, apiKey } = params;

  // We need an API key to initialize the Google provider
  // If not provided, try to fallback to process.env.GOOGLE_API_KEY
  const finalApiKey = apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!finalApiKey) {
    throw new Error('Google API key is missing for virtual search');
  }

  const google = createGoogleGenerativeAI({
    apiKey: finalApiKey,
  });

  // Create the model
  const model = google('gemini-3-flash-preview');

  const startTime = Date.now();

  try {
    const { text, toolCalls } = await generateText({
      model,
      tools: {
        googleSearch: (google as any).googleSearch(),
      },
      prompt: `Act as an expert web researcher. Perform a web search for the following query: "${query}". 
      Use your internal search grounding tools to find the most up-to-date and accurate information.
      Return a JSON object containing a detailed summary as the 'answer' and a list of the exact sources you used.
      
      OUTPUT FORMAT (JSON ONLY, NO MARKDOWN):
      {
        "answer": "...",
        "sources": [
          { "title": "...", "url": "...", "content": "..." }
        ]
      }`,
    });

    const responseTime = Date.now() - startTime;
    
    // Parse the JSON from the text response
    let parsedResult;
    try {
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResult = JSON.parse(jsonStr);
    } catch (parseError) {
      log.error('Failed to parse Google Virtual Search JSON:', text);
      throw new Error('Invalid JSON from Google Virtual Search');
    }

    // Format the response to match Tavily WebSearchResult
    const sources: WebSearchSource[] = (parsedResult.sources || []).map((src: any) => ({
      title: src.title,
      url: src.url,
      content: src.content,
      score: 1.0, 
    }));

    return {
      answer: parsedResult.answer || '',
      sources,
      query,
      responseTime,
    };
  } catch (error) {
    log.error('Google Virtual Search Failed:', error);
    throw error;
  }
}
