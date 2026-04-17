import fs from 'fs/promises';
import path from 'path';
import { extractText, getDocumentProxy } from 'unpdf';

const MAPPING = {
  'Ciencias Naturales.pdf': 'ciencias.txt',
  'Lengua.pdf': 'lengua.txt',
  'Matematica.pdf': 'matematicas.txt',
  'Sociales.pdf': 'sociales.txt'
};

async function run() {
  const kbDir = path.join(process.cwd(), 'knowledge_base');
  const outDir = path.join(process.cwd(), 'public', 'curriculums');
  
  await fs.mkdir(outDir, { recursive: true });

  const files = await fs.readdir(kbDir);
  for (const file of files) {
    if (file.endsWith('.pdf') && MAPPING[file]) {
      console.log(`Extracting ${file}...`);
      const filePath = path.join(kbDir, file);
      const buffer = await fs.readFile(filePath);
      
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const text = await extractText(pdf, { mergePages: true });
      
      const outPath = path.join(outDir, MAPPING[file]);
      await fs.writeFile(outPath, typeof text === 'string' ? text : text.text || text[0] || JSON.stringify(text));
      console.log(`Saved output to ${MAPPING[file]}`);
    }
  }
}

run().catch(console.error);
