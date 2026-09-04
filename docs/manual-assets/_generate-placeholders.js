const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname);
const shots = [
  ['01-login', 'Login'],
  ['02-inicio', 'Inicio'],
  ['03-menu', 'Menu principal'],
  ['04-admin-clientes', 'Admin - Clientes'],
  ['05-admin-usuarios', 'Admin - Usuarios'],
  ['06-cuentas', 'Cuentas Meta'],
  ['07-cuentas-conectadas', 'Cuentas conectadas'],
  ['08-composer', 'Generar Contenido'],
  ['09-composer-ia', 'Composer - IA'],
  ['10-radar', 'Conectar fuente'],
  ['11-aprobaciones', 'Aprobaciones'],
  ['12-calendario', 'Calendario'],
  ['13-reportes', 'Reportes'],
  ['14-selector-cliente', 'Selector de cliente'],
  ['15-historia', 'Opcion historia'],
];

for (const [file, label] of shots) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">',
    '<rect width="960" height="540" fill="#F0F2F5"/>',
    '<rect x="40" y="40" width="880" height="460" rx="12" fill="#FFFFFF" stroke="#1877F2" stroke-width="2" stroke-dasharray="10 6"/>',
    '<text x="480" y="245" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#1C1E21" font-weight="600">Captura pendiente</text>',
    `<text x="480" y="290" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#65676B">${label}</text>`,
    '<text x="480" y="335" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#1877F2">Reemplazar por screenshot real (PNG) desde produccion</text>',
    '</svg>',
  ].join('\n');
  fs.writeFileSync(path.join(dir, `${file}.svg`), svg);
}

console.log(`OK ${shots.length} placeholders`);
