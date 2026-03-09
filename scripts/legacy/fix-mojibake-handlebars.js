const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "simplified", "src");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && full.endsWith(".handlebars")) {
      out.push(full);
    }
  }
  return out;
}

let fixedCount = 0;
for (const file of walk(root)) {
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("Ã") || content.includes("Â")) {
    const fixed = Buffer.from(content, "latin1").toString("utf8");
    fs.writeFileSync(file, fixed, "utf8");
    console.log(`fixed: ${path.relative(process.cwd(), file)}`);
    fixedCount += 1;
  }
}

console.log(`total_fixed: ${fixedCount}`);
