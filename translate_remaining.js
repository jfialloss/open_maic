const fs = require('fs');

const files = ['stage', 'chat', 'generation'];

for (const file of files) {
  const content = fs.readFileSync(`lib/i18n/${file}.ts`, 'utf-8');
  const enStart = `export const ${file}EnUS = {`;
  const startIndex = content.indexOf(enStart);
  
  if (startIndex !== -1) {
    const enContent = content.substring(startIndex);
    let esContent = enContent.replace(`export const ${file}EnUS = {`, `export const ${file}EsES = {`);
    
    // Some basic translations across these files
    const translations = [
      ["'Start'", "'Empezar'"],
      ["'Finish'", "'Terminar'"],
      ["'Done'", "'Hecho'"],
      ["'Cancel'", "'Cancelar'"],
      ["'Loading'", "'Cargando'"],
      ["'Loading...'", "'Cargando...'"],
      ["'Error'", "'Error'"],
      ["'Success'", "'Exito'"],
      ["'Chat'", "'Chat'"],
      ["'Send'", "'Enviar'"],
      ["'Type a message'", "'Escribe un mensaje'"],
      ["'Generation'", "'Generacion'"],
      ["'Generate'", "'Generar'"],
      ["'Generating...'", "'Generando...'"]
    ];
    
    for (const [en, es] of translations) {
      esContent = esContent.replaceAll(en, es);
    }
    
    fs.appendFileSync(`lib/i18n/${file}.ts`, '\n\n' + esContent);
    console.log(`Appended EsES to ${file}`);
  } else {
    console.log(`Could not find EnUS block in ${file}`);
  }
}
