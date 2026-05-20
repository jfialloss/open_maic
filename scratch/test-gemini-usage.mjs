import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import fs from 'fs';
import path from 'path';

// Manual env reading to avoid external dotenv dependency
let googleApiKey = '';
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/GOOGLE_API_KEY\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/);
  if (match) {
    googleApiKey = match[1] || match[2] || match[3];
    googleApiKey = googleApiKey.trim();
  }
} catch (e) {
  console.error('Failed to read .env.local manually:', e.message);
}

console.log('Using GOOGLE_API_KEY (first 10 chars):', googleApiKey ? googleApiKey.substring(0, 10) + '...' : 'undefined');

if (!googleApiKey) {
  console.error('ERROR: GOOGLE_API_KEY not found in .env.local');
  process.exit(1);
}

const google = createGoogleGenerativeAI({ apiKey: googleApiKey });

async function run() {
  console.log('Sending request to Gemini 2.5 Flash...');
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'Escribe una frase corta de motivación para educadores.'
  });
  
  console.log('\n--- Result ---');
  console.log('Text:', result.text);
  console.log('\n--- Usage Information ---');
  console.log('Usage object:', JSON.stringify(result.usage, null, 2));
  console.log('Prompt Tokens:', result.usage.promptTokens);
  console.log('Completion Tokens:', result.usage.completionTokens);
  console.log('Total Tokens:', result.usage.totalTokens);
}

run().catch(error => {
  console.error('Error during test:', error);
});
