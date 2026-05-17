import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

async function run() {
  const result = await generateText({
    model: google('gemini-3.0-flash'), // Try with gemini-3.0-flash
    prompt: 'Hello world'
  });
  console.log('generateText result keys:', Object.keys(result));
  console.log('generateText usage:', result.usage);
  console.log('is promise?', result.usage instanceof Promise);
}

run().catch(console.error);
