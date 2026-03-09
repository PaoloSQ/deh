const path = require("path");

function stripNoiseAttributes(html) {
  return html.replace(/\sdata-testid="[^"]*"/g, "");
}

function findSectionEnd(source, startIndex) {
  let depth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    if (source.startsWith("<section", index)) {
      depth += 1;
      continue;
    }

    if (source.startsWith("</section>", index)) {
      depth -= 1;
      if (depth === 0) {
        return index + "</section>".length;
      }
    }
  }

  throw new Error("No se encontro el cierre de una seccion top-level");
}

function findTopLevelSections(html) {
  const sections = [];
  let index = 0;

  while (index < html.length) {
    const start = html.indexOf("<section", index);
    if (start === -1) {
      break;
    }

    const openEnd = html.indexOf(">", start);
    if (openEnd === -1) {
      break;
    }

    const openTag = html.slice(start, openEnd + 1);
    const idMatch = openTag.match(/\sid="([^"]+)"/);
    const end = findSectionEnd(html, start);

    sections.push({
      id: idMatch ? idMatch[1] : null,
      start,
      end,
      html: html.slice(start, end),
    });

    index = end;
  }

  return sections;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&[a-zA-Z]+;/g, " ");
}

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function extractHeadingText(sectionHtml) {
  const headingMatch = sectionHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!headingMatch) {
    return "";
  }

  return decodeEntities(headingMatch[1].replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function createUniqueName(baseName, usedNames, index) {
  const fallback = `section-${String(index + 1).padStart(2, "0")}`;
  const initial = baseName || fallback;

  if (!usedNames.has(initial)) {
    usedNames.add(initial);
    return initial;
  }

  let suffix = 2;
  while (usedNames.has(`${initial}-${suffix}`)) {
    suffix += 1;
  }

  const unique = `${initial}-${suffix}`;
  usedNames.add(unique);
  return unique;
}

function inferSectionName(section, index, usedNames) {
  const headingSlug = slugify(extractHeadingText(section.html)).split("-").slice(0, 5).join("-");
  const idSlug = section.id ? slugify(section.id.replace(/^comp-/, "")) : "";
  const preferred = headingSlug || idSlug;
  return createUniqueName(preferred, usedNames, index);
}

function resolveSectionPartials(mainInner, config = {}) {
  const cleanedMain = stripNoiseAttributes(mainInner);
  const topLevelSections = findTopLevelSections(cleanedMain);

  if (topLevelSections.length === 0) {
    return {
      cleanedMain,
      prefix: cleanedMain,
      suffix: "",
      blocks: [],
    };
  }

  const prefix = cleanedMain.slice(0, topLevelSections[0].start);
  const suffix = cleanedMain.slice(topLevelSections[topLevelSections.length - 1].end);

  if (config.sectionPartials && config.sectionPartials.length > 0) {
    if (topLevelSections.length !== config.sectionPartials.length) {
      throw new Error(
        `Esperaba ${config.sectionPartials.length} secciones top-level y encontre ${topLevelSections.length}`
      );
    }

    const blocks = topLevelSections.map((section, index) => {
      const expected = config.sectionPartials[index];

      if (section.id !== expected.id) {
        throw new Error(
          `Orden de secciones inesperado. Esperada ${expected.id}, encontrada ${section.id}`
        );
      }

      return {
        ...section,
        name: expected.name,
      };
    });

    return {
      cleanedMain,
      prefix,
      suffix,
      blocks,
    };
  }

  const usedNames = new Set();
  const blocks = topLevelSections.map((section, index) => ({
    ...section,
    name: inferSectionName(section, index, usedNames),
  }));

  return {
    cleanedMain,
    prefix,
    suffix,
    blocks,
  };
}

function buildPartialReference(partialsDir, name) {
  return `${path.basename(partialsDir)}/${name}`;
}

module.exports = {
  buildPartialReference,
  findTopLevelSections,
  resolveSectionPartials,
  stripNoiseAttributes,
};
