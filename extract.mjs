import fs from 'fs';
import path from 'path';
import { extractText } from 'unpdf';

async function main() {
  const dir = path.join(process.cwd(), 'knowledge_base');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const buffer = fs.readFileSync(path.join(dir, file));
    const uint8Array = new Uint8Array(buffer);
    try {
      const result = await extractText(uint8Array);
      let textStr = '';
      if (Array.isArray(result.text)) {
        textStr = result.text.join('\n');
      } else if (typeof result.text === 'string') {
        textStr = result.text;
      } else {
        textStr = JSON.stringify(result.text);
      }
      
      console.log(`Successfully extracted ${textStr.length} characters from ${file}`);
      
      const outline = textStr.substring(0, 5000);
      fs.writeFileSync(path.join(dir, `${file}.txt`), outline);
    } catch (err) {
      console.error(`Error with ${file}:`, err);
    }
  }
}

main().catch(console.error);
