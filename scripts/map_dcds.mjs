import fs from 'fs/promises';
import path from 'path';
import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { readFileSync } from 'fs';
try {
  const envConfig = readFileSync('.env.local', 'utf-8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  });
} catch (e) {
  console.log('No .env.local found or error parsing it');
}

function sliceCurriculumBySublevel(text, sublevel) {
  // En lugar de buscar índices que pueden fallar por el Índice o los pies de página,
  // dividimos el documento por la mitad usando ventanas generosas de 1 millón de caracteres.
  // Gemini 2.5 Flash soporta hasta 4 millones de caracteres, así que 1 millón es muy seguro y evita el Needle in a Haystack.
  
  if (sublevel === 'Bachillerato' || sublevel === 'Básica Superior') {
    // Tomar el final del documento (último millón de caracteres)
    return text.substring(Math.max(0, text.length - 1000000));
  } else {
    // Tomar el inicio del documento (primer millón de caracteres)
    return text.substring(0, 1000000);
  }
}

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const CURRICULUMS_DIR = path.join(process.cwd(), 'public', 'curriculums');
const SYLLABUS_PATH = path.join(process.cwd(), 'lib', 'data', 'syllabus.json');
const OUTPUT_PATH = path.join(process.cwd(), 'lib', 'data', 'syllabus_v2.json');

const FILES = {
  'Ciencias Naturales': 'MINEDU - Ciencias Naturales.md',
  'Matemática': 'MINEDU - Matemáticas.md',
  'Lengua y Literatura': 'MINEDU - Lengua & Literatura.md',
  'Ciencias Sociales': 'MINEDU - Estudios Sociales.md'
};

async function readCurriculum(subject) {
  const filePath = path.join(CURRICULUMS_DIR, FILES[subject]);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    console.warn(`No se pudo leer ${filePath}`);
    return '';
  }
}

async function extractOfficialObjectives(curriculumText, sublevel) {
  console.log(`\nExtrañendo Objetivos Oficiales para ${sublevel}...`);
  try {
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      system: `Eres un experto en el currículo ecuatoriano. Tu tarea es extraer los "Objetivos del área por subnivel" EXACTOS que se encuentran en el documento proporcionado para el subnivel: ${sublevel} (Ej: Básica Elemental, Media, Superior o Bachillerato). Los objetivos suelen tener códigos como O.CN.3.1, O.M.4.1, etc. Extrae un máximo de 5 objetivos más importantes.`,
      prompt: `DOCUMENTO CURRICULAR:\n${curriculumText}\n\nExtrae los objetivos...`,
      schema: z.object({
        objetivos: z.array(z.string().describe("El código y texto completo del objetivo oficial (Ej: O.CN.3.1. Observar y describir...)"))
      })
    });
    return object.objetivos;
  } catch (e) {
    console.error('Error extrayendo objetivos:', e.message);
    return [];
  }
}

async function mapTopicToDCD(tema, curriculumText, sublevel) {
  console.log(`  Buscando DCD para el tema: "${tema}"`);
  const focusedText = sliceCurriculumBySublevel(curriculumText, sublevel);
  
  try {
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      system: `Eres un experto en el currículo del Ministerio de Educación del Ecuador. 
Tu tarea es encontrar la Destreza con Criterio de Desempeño (DCD) EXACTA y OFICIAL que mejor corresponda al TEMA dado, asegurándote que pertenezca al subnivel "${sublevel}".
La DCD debe tener su código oficial (Ej: M.2.1.1., CN.3.2.1., LL.4.1.2.).
Busca exhaustivamente hasta el final en el documento adjunto la DCD cuyo texto encaje semánticamente de manera perfecta con el Tema.`,
      prompt: `SUBNIVEL: ${sublevel}\nTEMA A ENSEÑAR: "${tema}"\n\nDOCUMENTO CURRICULAR (Fracción enfocada):\n${focusedText}`,
      schema: z.object({
        dcd_code: z.string().describe("El código exacto de la DCD encontrada (Ej: CN.3.1.2)"),
        dcd_text: z.string().describe("El texto completo de la DCD, excluyendo el código (Ej: Explorar y clasificar las plantas sin semilla...)")
      })
    });
    return `${object.dcd_code} ${object.dcd_text}`;
  } catch (e) {
    console.error(`  Error mapeando tema "${tema}":`, e.message);
    return "DCD NO ENCONTRADA. Se requiere revisión manual.";
  }
}

async function processInBatches(items, batchSize, processFn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processFn));
    results.push(...batchResults);
  }
  return results;
}

async function run() {
  const syllabusRaw = await fs.readFile(SYLLABUS_PATH, 'utf-8');
  const syllabus = JSON.parse(syllabusRaw);
  const syllabusV2 = JSON.parse(JSON.stringify(syllabus)); // Deep copy

  for (const subject of Object.keys(syllabus)) {
    if (subject === 'Inglés' || !FILES[subject]) {
      console.log(`Saltando materia sin archivo MD: ${subject}`);
      continue;
    }
    console.log(`\n================================`);
    console.log(`Procesando materia: ${subject}`);
    const curriculumText = await readCurriculum(subject);
    
    if (!curriculumText) continue;

    for (const sublevel of Object.keys(syllabus[subject])) {
      console.log(`\n--- Subnivel: ${sublevel} ---`);
      
      // 1. Extract Official Objectives (only if missing)
      if (!syllabusV2[subject][sublevel]["objetivos_oficiales"] || syllabusV2[subject][sublevel]["objetivos_oficiales"].length === 0) {
        const officialObjectives = await extractOfficialObjectives(curriculumText, sublevel);
        syllabusV2[subject][sublevel]["objetivos_oficiales"] = officialObjectives;
      }

      // 2. Map DCDs for each Theme
      for (const unit of Object.keys(syllabus[subject][sublevel])) {
        if (unit === "objetivos_oficiales") continue;
        
        console.log(`\nUnidad: ${unit}`);
        const temas = syllabus[subject][sublevel][unit].temas;

        const temasMapeados = await processInBatches(temas, 30, async (temaObj) => {
          // Si ya es un objeto y tiene una DCD válida, mantenerlo
          if (typeof temaObj === 'object' && temaObj.dcd && 
              !temaObj.dcd.includes('ENCONTRAD') && 
              !temaObj.dcd.includes('NOT_FOUND') && 
              !temaObj.dcd.includes('NO DCD') &&
              temaObj.dcd.length > 15) {
            return temaObj;
          }
          
          const titulo = typeof temaObj === 'object' ? temaObj.titulo : temaObj;
          const dcdCompleta = await mapTopicToDCD(titulo, curriculumText, sublevel);
          return {
            titulo: titulo,
            dcd: dcdCompleta
          };
        });

        syllabusV2[subject][sublevel][unit].temas = temasMapeados;
      }
    }
    // Save progressively after each subject
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(syllabusV2, null, 2));
    console.log(`Guardado progreso parcial en ${OUTPUT_PATH}`);
  }

  console.log(`\n¡ÉXITO! El nuevo syllabus ha sido guardado completamente en: ${OUTPUT_PATH}`);
}

run().catch(console.error);
