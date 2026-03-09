const fs = require('fs');
const path = require('path');

const ORIGIN = path.join(__dirname, '../descarga/www.dehonline.es/index.html');

const html = fs.readFileSync(ORIGIN, 'utf-8');

function extractStyles() {
  const colors = [...new Set(html.match(/#(?:[0-9a-fA-F]{3,6})/gi) || [])]
    .filter(c => !c.match(/^#(?:0-9|a-f){3,3}$/i) || c.length === 7);
  
  const colorsFiltered = colors.filter(c => 
    !['#000', '#fff', '#ffffff', '#000000'].includes(c.toLowerCase())
  );
  
  const fontFamilies = [
    ...new Set(html.match(/font-family:[^;]+/gi) || [])
  ].slice(0, 10);
  
  const fontSizes = [...new Set(
    html.match(/font-size:\s*(\d+)px/gi) || []
  )].map(s => s.replace('font-size:', '').trim()).slice(0, 15);
  
  const textColors = [...new Set(
    html.match(/color:\s*#[0-9a-fA-F]{3,6}/gi) || [])
  ].slice(0, 15);
  
  const bgColors = [...new Set(
    html.match(/background(?:-color)?:\s*#[0-9a-fA-F]{3,6}/gi) || [])
  ].slice(0, 15);
  
  console.log('=== COLORES (filtrados) ===');
  console.log(colorsFiltered.join(', '));
  
  console.log('\n=== FAMILIAS DE FUENTE ===');
  fontFamilies.forEach(f => console.log(f));
  
  console.log('\n=== TAMAÑOS DE FUENTE (px) ===');
  console.log([...new Set(fontSizes)].sort((a,b) => a-b).join(', '));
  
  console.log('\n=== COLORES DE TEXTO ===');
  console.log(textColors.join(', '));
  
  console.log('\n=== COLORES DE FONDO ===');
  console.log(bgColors.join(', '));
}

function extractSections() {
  const sectionPatterns = [
    { name: 'Hero/Stats', regex: /<h1[^>]*>.*?<\/h1>/gi },
    { name: 'Servicios', regex: /Certificados?/i },
    { name: 'Cifras', regex: /DEH en cifras/i },
    { name: 'Partners', regex: /partners?/i },
    { name: 'Comunidad', regex: /comunidad/i },
    { name: 'Blog', regex: /<h3[^>]*>.*?blog/i }
  ];
  
  console.log('\n=== SECCIONES ENCONTRADAS ===');
  sectionPatterns.forEach(s => {
    const match = html.match(s.regex);
    console.log(`${s.name}: ${match ? 'SÍ' : 'NO'}`);
  });
}

function extractTextContent() {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  console.log('\n=== CONTENIDO PRINCIPAL (primeros 2000 chars) ===');
  console.log(text.substring(0, 2000));
}

extractStyles();
extractSections();
extractTextContent();
