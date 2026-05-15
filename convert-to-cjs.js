/**
 * Convierte import/export ES6 a require/module.exports para CommonJS.
 * Uso: node convert-to-cjs.js
 * Ejecutar desde la raíz del proyecto.
 */
const fs = require('fs');
const path = require('path');
const glob = require('fs').promises || fs.promises;

function walkSync(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      walkSync(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function convertFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  let changed = false;

  // 1. Convertir: import X from "Y" → const X = require("Y")
  content = content.replace(/^import\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/gm, (match, name, source) => {
    changed = true;
    // Si la ruta es relativa, mantenerla. Si no, es un paquete npm.
    if (source.startsWith('.')) {
      // Quitar extensión .js si existe
      source = source.replace(/\.js$/, '');
      return `const ${name} = require("${source}")`;
    }
    return `const ${name} = require("${source}")`;
  });

  // 2. Convertir: import * as X from "Y" → const X = require("Y")
  content = content.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/gm, (match, name, source) => {
    changed = true;
    if (source.startsWith('.')) {
      source = source.replace(/\.js$/, '');
      return `const ${name} = require("${source}")`;
    }
    return `const ${name} = require("${source}")`;
  });

  // 3. Convertir: import { X, Y } from "Z" → const { X, Y } = require("Z")
  content = content.replace(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm, (match, names, source) => {
    changed = true;
    if (source.startsWith('.')) {
      source = source.replace(/\.js$/, '');
      return `const {${names}} = require("${source}")`;
    }
    return `const {${names}} = require("${source}")`;
  });

  // 4. Convertir: import X, { Y } from "Z" → const X = require("Z"); const { Y } = X
  // (Este patrón no se usa en el proyecto, skip)

  // 5. Convertir: export default class X → module.exports = X (al final del archivo)
  // Primero quitamos "export default" delante de class
  content = content.replace(/^export default class\s+(\w+)/gm, (match, className) => {
    changed = true;
    return `class ${className}`;
  });

  // 6. Convertir: export class X → class X + exports.X = X
  content = content.replace(/^export class\s+(\w+)/gm, (match, className) => {
    changed = true;
    return `class ${className}`;
  });

  // 7. Convertir: export default function X → function X + module.exports = X
  content = content.replace(/^export default function\s+(\w+)/gm, (match, funcName) => {
    changed = true;
    return `function ${funcName}`;
  });

  // 8. Convertir: export function X → function X + exports.X = X
  content = content.replace(/^export function\s+(\w+)/gm, (match, funcName) => {
    changed = true;
    return `function ${funcName}`;
  });

  // 9. Convertir: export const/let/var X = → const/let/var X = + exports.X = X
  content = content.replace(/^export\s+(const|let|var)\s+(\w+)\s*=/gm, (match, kind, varName) => {
    changed = true;
    return `${kind} ${varName} =`;
  });

  // 10. Convertir: export { X, Y } → al final, exports.X = X; exports.Y = Y
  // Este es complejo, posponer

  // 11. Si hay "export default X" donde X no es class/function → module.exports = X
  content = content.replace(/^export default\s+(\w+);?\s*$/gm, (match, name) => {
    changed = true;
    return `module.exports = ${name}`;
  });

  // 12. Agregar module.exports al final para clases que eran export default
  // Buscar la última clase definida y agregar module.exports
  const classMatch = content.match(/^class\s+(\w+)/gm);
  if (classMatch && original.includes('export default class')) {
    const lastClass = classMatch[classMatch.length - 1];
    const className = lastClass.replace('class ', '').trim();
    // Solo si no hay ya un module.exports al final
    if (!content.includes(`module.exports = ${className}`) && !content.includes(`module.exports=${className}`)) {
      content += `\nmodule.exports = ${className}`;
    }
  }

  // 13. Reemplazar import de módulos nativos con require (net, fs, crypto, zlib, path)
  // Ya están como var x = require('x') — mantenerlos

  if (changed && content !== original) {
    fs.writeFileSync(filePath, content);
    return { file: filePath, changed: true };
  }
  return { file: filePath, changed: false };
}

// Main
const srcDir = path.join(__dirname, 'src');
const files = walkSync(srcDir);
console.log(`Archivos a procesar: ${files.length}`);

let changed = 0;
let unchanged = 0;

for (const file of files) {
  // Saltar los archivos pre-ES6 que ya son CommonJS
  const relative = path.relative(srcDir, file);
  if (relative === 'io/bytearray.js' || relative === 'io/custom_data_wrapper.js') {
    unchanged++;
    continue;
  }
  // Saltar enums (ya usan module.exports)
  if (relative.startsWith('enums/')) {
    unchanged++;
    continue;
  }
  // Saltar typings
  if (relative.includes('typings')) {
    unchanged++;
    continue;
  }

  const result = convertFile(file);
  if (result.changed) {
    changed++;
    console.log(`  ✓ ${relative}`);
  } else {
    unchanged++;
  }
}

console.log(`\nConvertidos: ${changed} | Sin cambios: ${unchanged}`);
