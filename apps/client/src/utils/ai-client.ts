/**
 * ai-client.ts
 * 
 * Multi-provider AI client for client-side translation requests.
 * Supports: OpenAI, Groq (OpenAI-compatible), Claude/Anthropic
 * 
 * All requests are made directly from the client without backend routing.
 */

export interface AiParams {
  apiKey: string;
  model: string;
  url: string;
  provider?: 'openai' | 'groq' | 'anthropic' | 'auto';
}

export interface TranslationResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Detect AI provider from URL or explicit provider setting
 */
function detectProvider(url: string, explicit?: string): 'openai' | 'groq' | 'anthropic' {
  if (explicit && ['openai', 'groq', 'anthropic'].includes(explicit)) {
    return explicit as 'openai' | 'groq' | 'anthropic';
  }

  if (url.includes('anthropic')) return 'anthropic';
  if (url.includes('groq')) return 'groq';
  // Default to OpenAI-compatible (OpenAI, local models, etc.)
  return 'openai';
}

/**
 * Translate HTML content using AI
 * Automatically detects the provider and formats requests accordingly
 */
/**
 * Translate content using AI
 * Automatically detects the provider and formats requests accordingly
 */
export async function translateWithAi(
  sourceContent: string,
  targetLanguage: string,
  aiParams: AiParams,
  isHtml = true
): Promise<TranslationResult> {
  const provider = detectProvider(aiParams.url, aiParams.provider);

  try {
    switch (provider) {
      case 'anthropic':
        return await callAnthropicApi(sourceContent, targetLanguage, aiParams, isHtml);
      case 'groq':
      case 'openai':
      default:
        return await callOpenAiCompatibleApi(sourceContent, targetLanguage, aiParams, isHtml);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Call OpenAI-compatible API (OpenAI, Groq, Ollama, etc.)
 */
async function callOpenAiCompatibleApi(
  content: string,
  targetLanguage: string,
  aiParams: AiParams,
  isHtml = true
): Promise<TranslationResult> {
  const systemPrompt = isHtml
    ? `You are a professional e-commerce translator and copywriter. ` +
      `Translate the following HTML product description to ${targetLanguage}. ` +
      `Important: Preserve ALL HTML tags exactly as they are. ` +
      `Return ONLY the translated HTML content, no explanations or extra text.`
    : `You are a professional e-commerce copywriter. ` +
      `Translate the following product title to ${targetLanguage}. ` +
      `Return only the translated title as plain text, no quotes, no HTML, no extra text.`;

  // Ensure base URL ends with /
  const baseUrl = aiParams.url.endsWith('/') ? aiParams.url : aiParams.url + '/';
  const endpoint = new URL('chat/completions', baseUrl).toString();

  // Adapt max_tokens based on provider
  // Groq has strict limits per model, OpenAI is more generous
  let maxTokens = 2048;
  if (aiParams.url.includes('groq')) {
    maxTokens = 512; // Groq's typical limit
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiParams.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiParams.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData?.error?.message || errorMessage;
    } catch {
      const text = await response.text();
      errorMessage = text.substring(0, 200);
    }
    return {
      success: false,
      error: `OpenAI-compatible API error: ${errorMessage}`,
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content: string } }>;
  };
  const translated = data.choices?.[0]?.message?.content?.trim();

  if (!translated) {
    return {
      success: false,
      error: 'No content returned from API',
    };
  }

  return {
    success: true,
    content: translated,
  };
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropicApi(
  content: string,
  targetLanguage: string,
  aiParams: AiParams,
  isHtml = true
): Promise<TranslationResult> {
  const systemPrompt = isHtml
    ? `You are a professional e-commerce translator and copywriter. ` +
      `Translate the following HTML product description to ${targetLanguage}. ` +
      `Important: Preserve ALL HTML tags exactly as they are. ` +
      `Return ONLY the translated HTML content, no explanations or extra text.`
    : `You are a professional e-commerce copywriter. ` +
      `Translate the following product title to ${targetLanguage}. ` +
      `Return only the translated title as plain text, no quotes, no HTML, no extra text.`;

  // Ensure base URL ends with /
  const baseUrl = aiParams.url.endsWith('/') ? aiParams.url : aiParams.url + '/';
  const endpoint = new URL('messages', baseUrl).toString();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': aiParams.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: aiParams.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData?.error?.message || errorMessage;
    } catch {
      const text = await response.text();
      errorMessage = text.substring(0, 200);
    }
    return {
      success: false,
      error: `Anthropic API error: ${errorMessage}`,
    };
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text: string }>;
  };
  const translated = data.content?.[0]?.text?.trim();

  if (!translated) {
    return {
      success: false,
      error: 'No content returned from Anthropic API',
    };
  }

  return {
    success: true,
    content: translated,
  };
}
