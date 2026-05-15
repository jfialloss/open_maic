/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response using Tavily search.
 */

import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { searchWithGoogleVirtual } from '@/lib/web-search/google-virtual';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import type { WebSearchResult } from '@/lib/types/web-search';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('WebSearch');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, apiKey: clientApiKey } = body as {
      query?: string;
      apiKey?: string;
    };

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    let result: WebSearchResult;

    try {
      log.info(`[WebSearch] Attempting virtual Google Search for: ${query}`);
      result = await searchWithGoogleVirtual({ query: query.trim() });
    } catch (googleError) {
      log.warn('[WebSearch] Google Virtual Search failed, falling back to Tavily', googleError);
      
      const apiKey = resolveWebSearchApiKey(clientApiKey);
      if (!apiKey) {
        return apiError(
          'MISSING_API_KEY',
          400,
          'Google Search failed and Tavily API key is not configured. Set it in Settings → Web Search or set TAVILY_API_KEY env var.',
        );
      }
      
      log.info(`[WebSearch] Using Tavily Search for: ${query}`);
      result = await searchWithTavily({ query: query.trim(), apiKey });
    }

    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error('[WebSearch] Error:', err);
    const message = err instanceof Error ? err.message : 'Web search failed';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
