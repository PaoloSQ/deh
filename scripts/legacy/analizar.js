const fs = require('fs');
const path = require('path');

const ORIGIN = path.join(__dirname, '../descarga/www.dehonline.es');
const OUTPUT = path.join(__dirname, '../simplified/src/pages');

function cleanHtml(html) {
  return html
    .replace(/<[^>]+class="[^"]*wixui-rich-text[^"]*"[^>]*>/g, '')
    .replace(/<span[^>]*class="[^"]*wixui-rich-text[^"]*"[^>]*>|<\/span>/g, '')
    .replace(/style="[^"]*"/g, '')
    .replace(/data-[^=]+="[^"]*"/g, '')
    .replace(/id="[^"]*"/g, '')
    .replace(/class="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSections(html, filename) {
  const sections = [];
  
  const h1Matches = html.match(/<h1[^>]*>.*?<\/h1>/gi) || [];
  const h2Matches = html.match(/<h2[^>]*>.*?<\/h2>/gi) || [];
  const h3Matches = html.match(/<h3[^>]*>.*?<\/h3>/gi) || [];
  const pMatches = html.match(/<p[^>]*>.*?<\/p>/gi) || [];
  
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  const colors = [...new Set(html.match(/#(?:[0-9a-fA-F]{3}){1,2}/gi) || [])];
  const fonts = [...new Set(html.match(/font-family:[^;]+/gi) || [])];
  const fontSizes = [...new Set(html.match(/font-size:\s*[\d.]+(?:px|em|rem)/gi) || [])];
  
  return {
    filename,
    headings: {
      h1: h1Matches.map(cleanHtml),
      h2: h2Matches.map(cleanHtml),
      h3: h3Matches.map(cleanHtml)
    },
    paragraphs: pMatches.slice(0, 10).map(cleanHtml),
    textPreview: textContent.substring(0, 500),
    colors: colors.slice(0, 10),
    fonts: fonts.slice(0, 5),
    fontSizes: fontSizes.slice(0, 10)
  };
}

function analyzeSite() {
  const files = fs.readdirSync(ORIGIN).filter(f => f.endsWith('.html'));
  
  const results = files.map(filename => {
    const filePath = path.join(ORIGIN, filename);
    const html = fs.readFileSync(filePath, 'utf-8');
    return extractSections(html, filename);
  });
  
  fs.writeFileSync(
    path.join(__dirname, 'analysis.json'),
    JSON.stringify(results, null, 2)
  );
  
  console.log(`Analizadas ${results.length} páginas`);
  console.log('Colores encontrados:', results[0]?.colors);
  console.log('Fuentes:', results[0]?.fonts);
}

analyzeSite();
