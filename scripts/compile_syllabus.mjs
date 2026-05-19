import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'curriculums');
const OUTPUT_FILE = path.join(__dirname, '..', 'lib', 'data', 'syllabus.json');

const newFiles = [
  "curriculum_5to_basica_con_dcd.json",
  "curriculum_6to_basica_con_dcd.json",
  "curriculum_7mo_basica_con_dcd.json",
  "curriculum_8vo_basica_con_dcd.json",
  "curriculum_9no_basica_con_dcd.json",
  "curriculum_10mo_basica_con_dcd.json",
  "curriculum_1ro_bgu_con_dcd.json",
  "curriculum_2do_bgu_con_dcd.json",
  "curriculum_3ro_bgu_con_dcd.json"
];

async function compile() {
  console.log('Iniciando compilación de syllabus.json...');
  
  // 1. Cargar el syllabus viejo para extraer Inglés
  const oldSyllabusPath = OUTPUT_FILE;
  let oldSyllabus = {};
  if (fs.existsSync(oldSyllabusPath)) {
    oldSyllabus = JSON.parse(fs.readFileSync(oldSyllabusPath, 'utf8'));
  }
  
  const inglesModule = oldSyllabus['Inglés'];
  if (!inglesModule) {
    console.error('ERROR: No se encontró el módulo "Inglés" en el syllabus actual.');
    process.exit(1);
  }

  // 2. Crear la nueva estructura
  const finalSyllabus = {
    "Ciencias Naturales": {},
    "Matemática": {},
    "Lengua y Literatura": {},
    "Estudios Sociales": {},
    "Inglés": inglesModule // Preservado intacto!
  };

  // 3. Iterar por cada archivo JSON de los nuevos curriculos y fusionarlos
  for (const filename of newFiles) {
    const filePath = path.join(PUBLIC_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`WARNING: Archivo no encontrado: ${filename}`);
      continue;
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Cada archivo tiene la estructura: { "Ciencias Naturales": { "5to de EGB": { ... } }, ... }
    for (const [subject, gradesObj] of Object.entries(fileData)) {
      if (!finalSyllabus[subject]) {
         finalSyllabus[subject] = {};
      }
      for (const [grade, units] of Object.entries(gradesObj)) {
        finalSyllabus[subject][grade] = units;
      }
    }
  }

  // 4. Guardar el archivo consolidado
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalSyllabus, null, 2), 'utf8');
  console.log(`Compilación exitosa. Escrito en: ${OUTPUT_FILE}`);
}

compile().catch(console.error);
