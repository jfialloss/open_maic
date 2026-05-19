import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'Hello world',
  });
  console.log('Result usage:', result.usage);
}
test().catch(console.error);
