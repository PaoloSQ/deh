const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const DEFAULT_VIEWPORT = { width: 1366, height: 900, deviceScaleFactor: 1 };
const RESPONSIVE_BREAKPOINTS = [320, 375, 768, 1024, 1365, 1366, 1920];
const OUTPUT_DIR = path.join(__dirname, "../comparacion");
const MODES = new Set(["summary", "nav", "components", "hover", "responsive", "all"]);

const TARGETS = [
  {
    name: "live",
    url: "https://www.dehonline.es/",
    selector: "#SITE_HEADER",
    hoverSelector: ".StylableHorizontalMenu3372578893__root .itemDepth02233374943__label",
  },
  {
    name: "local",
    url: "http://localhost:3001/",
    selector: "header.site-header",
    hoverSelector: "header.site-header .site-nav a",
  },
];

function showHelp() {
  console.log(`
INSPECT HEADER

Usage:
  node scripts/inspect-header.js [options]

Options:
  -m, --mode <name>     summary | nav | components | hover | responsive | all
  --viewport <WxH>      Viewport base for non-responsive modes (default: 1366x900)
  --wait <ms>           Extra wait after navigation (default: 1200)
  --no-screenshot       Skip header screenshots in summary/all
  -h, --help            Show this help

Examples:
  node scripts/inspect-header.js
  node scripts/inspect-header.js --mode nav
  node scripts/inspect-header.js --mode hover
  node scripts/inspect-header.js --mode responsive
  node scripts/inspect-header.js --mode all --viewport 1440x900
`);
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(value || "");
  if (!match) {
    throw new Error("Viewport invalido. Usa el formato WIDTHxHEIGHT, por ejemplo 1366x900.");
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
    deviceScaleFactor: 1,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: "summary",
    viewport: { ...DEFAULT_VIEWPORT },
    waitMs: 1200,
    screenshot: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "-m":
      case "--mode": {
        const mode = args[index + 1];
        if (!MODES.has(mode)) {
          throw new Error(`Modo invalido: ${mode}`);
        }
        options.mode = mode;
        index += 1;
        break;
      }
      case "--viewport":
        options.viewport = parseViewport(args[index + 1]);
        index += 1;
        break;
      case "--wait":
        options.waitMs = Number(args[index + 1]);
        index += 1;
        break;
      case "--no-screenshot":
        options.screenshot = false;
        break;
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return options;
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function numericDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return round(b - a, 2);
}

function calculateLabelGaps(items) {
  const gaps = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    const current = items[index].label;
    const next = items[index + 1].label;
    const gap = next.x - (current.x + current.w);
    gaps.push(round(gap, 2));
  }
  return gaps;
}

function getEffectiveRootWidth(item) {
  if (!item || !item.root) {
    return null;
  }

  const baseWidth = item.root.w;
  const beforeLeft = parseFloat(item.root.before.left || "NaN");
  const beforeRight = parseFloat(item.root.before.right || "NaN");

  let extraWidth = 0;
  if (Number.isFinite(beforeLeft)) {
    extraWidth += Math.abs(beforeLeft);
  }
  if (Number.isFinite(beforeRight)) {
    extraWidth += Math.abs(beforeRight);
  }

  return round(baseWidth + extraWidth, 2);
}

function printSection(title) {
  console.log("\n" + "=".repeat(64));
  console.log(title);
  console.log("=".repeat(64));
}

async function captureHeaderScreenshot(page, selector, targetName) {
  const handle = await page.$(selector);
  if (!handle) {
    return null;
  }

  ensureOutputDir();
  const filePath = path.join(OUTPUT_DIR, `header-${targetName}.png`);
  await handle.screenshot({ path: filePath });
  return filePath;
}

async function openTarget(page, target, options, hover = false) {
  await page.setViewport(options.viewport);
  await page.goto(target.url, { waitUntil: "networkidle2", timeout: 60000 });
  if (options.waitMs > 0) {
    await sleep(options.waitMs);
  }

  await page.waitForSelector(target.selector, { timeout: 15000 });

  if (hover) {
    await page.hover(target.hoverSelector);
    await sleep(250);
  }

  if (options.screenshot && !hover && (options.mode === "summary" || options.mode === "all")) {
    await captureHeaderScreenshot(page, target.selector, target.name);
  }
}

async function collectSnapshot(page, target, options, hover = false) {
  await openTarget(page, target, options, hover);

  return page.evaluate((selector) => {
    const visible = (element) => {
      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        parseFloat(style.opacity || "1") > 0
      );
    };

    const firstVisible = (elements) => elements.find((element) => visible(element)) || null;

    const rectData = (element) => {
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
      };
    };

    const dataAttrCount = (element) => {
      if (!element) {
        return 0;
      }

      return Array.from(element.attributes).filter((attribute) =>
        attribute.name.startsWith("data-")
      ).length;
    };

    const pickStyles = (style, keys) => {
      const result = {};
      keys.forEach((key) => {
        result[key] = style[key];
      });
      return result;
    };

    const header = document.querySelector(selector);
    if (!header) {
      return null;
    }

    const findOne = (...selectors) => {
      for (const currentSelector of selectors) {
        const match = firstVisible(Array.from(header.querySelectorAll(currentSelector)));
        if (match) {
          return match;
        }
      }
      return null;
    };

    const headerStyle = getComputedStyle(header);
    const logo = findOne("img");
    const navRoot = findOne(".StylableHorizontalMenu3372578893__root", ".site-nav", "nav");
    const loginButton = findOne(".eUGVn8", ".header-login");
    const loginText = findOne(".LcZX5c", ".header-login__text");
    const loginIconRoot = findOne(".wixui-login-social-bar__avatar-icon", ".header-login__icon");
    const loginGraphic = loginButton
      ? firstVisible(Array.from(loginButton.querySelectorAll("svg")))
      : findOne("svg");

    const labelCandidates = Array.from(
      header.querySelectorAll(
        ".itemDepth02233374943__label, .wixui-horizontal-menu__item-label, .site-nav a"
      )
    ).filter((element) => visible(element));

    const navItems = labelCandidates.map((label, index) => {
      const root = label.closest("a") || label;
      const labelStyle = getComputedStyle(label);
      const rootStyle = getComputedStyle(root);
      const beforeStyle = getComputedStyle(root, "::before");

      return {
        index,
        text: (label.textContent || "").trim(),
        label: {
          tag: label.tagName.toLowerCase(),
          className: label.className || "",
          ...rectData(label),
          styles: pickStyles(labelStyle, [
            "fontFamily",
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
            "color",
            "display",
            "backgroundColor",
            "borderRadius",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
            "marginLeft",
            "whiteSpace",
            "outline",
          ]),
        },
        root: {
          tag: root.tagName.toLowerCase(),
          className: root.className || "",
          ...rectData(root),
          styles: pickStyles(rootStyle, [
            "display",
            "position",
            "overflow",
            "alignItems",
            "backgroundColor",
            "color",
            "borderRadius",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
            "marginLeft",
            "cursor",
          ]),
          before: pickStyles(beforeStyle, ["backgroundColor", "left", "right", "borderRadius"]),
        },
      };
    });

    const logoStyle = logo ? getComputedStyle(logo) : null;
    const navStyle = navRoot ? getComputedStyle(navRoot) : null;
    const loginButtonStyle = loginButton ? getComputedStyle(loginButton) : null;
    const loginTextStyle = loginText ? getComputedStyle(loginText) : null;
    const loginIconRootStyle = loginIconRoot ? getComputedStyle(loginIconRoot) : null;
    const loginGraphicStyle = loginGraphic ? getComputedStyle(loginGraphic) : null;

    return {
      header: {
        tag: header.tagName.toLowerCase(),
        className: header.className || "",
        attrCount: header.attributes.length,
        ...rectData(header),
        styles: pickStyles(headerStyle, [
          "display",
          "visibility",
          "opacity",
          "position",
          "overflow",
          "backgroundColor",
          "borderBottom",
          "borderRadius",
          "transform",
          "filter",
          "boxShadow",
          "textShadow",
        ]),
      },
      logo: logo
        ? {
            tag: logo.tagName.toLowerCase(),
            className: logo.className || "",
            alt: logo.alt || "",
            dataAttrCount: dataAttrCount(logo),
            ...rectData(logo),
            styles: pickStyles(logoStyle, ["boxShadow", "filter"]),
          }
        : null,
      nav: navRoot
        ? {
            tag: navRoot.tagName.toLowerCase(),
            className: navRoot.className || "",
            ...rectData(navRoot),
            styles: pickStyles(navStyle, [
              "display",
              "gap",
              "justifyContent",
              "alignItems",
              "position",
              "overflow",
              "transform",
            ]),
            items: navItems,
          }
        : null,
      login: {
        button: loginButton
          ? {
              tag: loginButton.tagName.toLowerCase(),
              className: loginButton.className || "",
              dataAttrCount: dataAttrCount(loginButton),
              ...rectData(loginButton),
              styles: pickStyles(loginButtonStyle, [
                "display",
                "backgroundColor",
                "color",
                "fontFamily",
                "fontSize",
                "fontWeight",
                "lineHeight",
                "border",
                "borderRadius",
                "boxShadow",
                "textShadow",
              ]),
            }
          : null,
        text: loginText
          ? {
              text: (loginText.textContent || "").trim(),
              className: loginText.className || "",
              styles: pickStyles(loginTextStyle, [
                "fontFamily",
                "fontSize",
                "fontWeight",
                "lineHeight",
                "letterSpacing",
                "color",
              ]),
            }
          : null,
        iconRoot: loginIconRoot
          ? {
              tag: loginIconRoot.tagName.toLowerCase(),
              className: loginIconRoot.className || "",
              ...rectData(loginIconRoot),
              styles: pickStyles(loginIconRootStyle, [
                "display",
                "backgroundColor",
                "color",
                "borderRadius",
              ]),
            }
          : null,
        graphic: loginGraphic
          ? {
              tag: loginGraphic.tagName.toLowerCase(),
              viewBox: loginGraphic.getAttribute("viewBox") || null,
              ...rectData(loginGraphic),
              styles: pickStyles(loginGraphicStyle, ["fill", "color"]),
            }
          : null,
      },
    };
  }, target.selector);
}

async function collectResponsiveState(page, target, options, width) {
  await page.setViewport({
    width,
    height: options.viewport.height,
    deviceScaleFactor: 1,
  });
  await page.goto(target.url, { waitUntil: "networkidle2", timeout: 60000 });
  if (options.waitMs > 0) {
    await sleep(options.waitMs);
  }
  await page.waitForSelector(target.selector, { timeout: 15000 });

  return page.evaluate((selector) => {
    const header = document.querySelector(selector);
    if (!header) {
      return null;
    }

    const visible = (element) => {
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };

    const logo = header.querySelector("img");
    const nav = header.querySelector(".StylableHorizontalMenu3372578893__root, .site-nav, nav");
    const login = header.querySelector(".eUGVn8, .header-login");

    return {
      headerHeight: header.getBoundingClientRect().height,
      headerVisible: visible(header),
      logoVisible: visible(logo),
      navVisible: visible(nav),
      loginVisible: visible(login),
    };
  }, target.selector);
}

function renderSummary(snapshots) {
  TARGETS.forEach((target) => {
    console.log("@@" + target.name);
    console.log(JSON.stringify(snapshots[target.name], null, 2));
  });
}

function renderNavReport(snapshots) {
  const live = snapshots.live.nav;
  const local = snapshots.local.nav;
  const liveGaps = calculateLabelGaps(live.items);
  const localGaps = calculateLabelGaps(local.items);

  printSection("NAV ANALYSIS");

  console.log("LIVE");
  live.items.forEach((item) => {
    console.log(
      `  [${item.index}] ${item.text} | x=${formatNumber(item.label.x)} | width=${formatNumber(item.label.w)} | rootWidth=${formatNumber(item.root.w)}`
    );
  });
  console.log("  gaps=" + JSON.stringify(liveGaps));

  console.log("\nLOCAL");
  local.items.forEach((item) => {
    console.log(
      `  [${item.index}] ${item.text} | x=${formatNumber(item.label.x)} | width=${formatNumber(item.label.w)} | rootWidth=${formatNumber(item.root.w)}`
    );
  });
  console.log("  gaps=" + JSON.stringify(localGaps));

  console.log("\nDIFFS");
  for (let index = 0; index < Math.min(live.items.length, local.items.length); index += 1) {
    const liveItem = live.items[index];
    const localItem = local.items[index];
    const xDiff = numericDiff(liveItem.label.x, localItem.label.x);
    const widthDiff = numericDiff(liveItem.label.w, localItem.label.w);

    console.log(`  [${index}] ${liveItem.text} | xDiff=${xDiff} | widthDiff=${widthDiff}`);
  }

  liveGaps.forEach((gap, index) => {
    const diff = numericDiff(gap, localGaps[index]);
    console.log(
      `  gap ${index}-${index + 1} | live=${gap} | local=${localGaps[index]} | diff=${diff}`
    );
  });
}

function renderComponentsReport(snapshots) {
  const live = snapshots.live;
  const local = snapshots.local;

  printSection("COMPONENTS");

  console.log(
    `Header height | live=${formatNumber(live.header.h)} | local=${formatNumber(local.header.h)} | diff=${numericDiff(live.header.h, local.header.h)}`
  );
  console.log(
    `Logo        | live=${formatNumber(live.logo.w)}x${formatNumber(live.logo.h)} @ ${formatNumber(live.logo.x)},${formatNumber(live.logo.y)} | local=${formatNumber(local.logo.w)}x${formatNumber(local.logo.h)} @ ${formatNumber(local.logo.x)},${formatNumber(local.logo.y)}`
  );
  console.log(
    `Login btn   | live=${formatNumber(live.login.button.w)}x${formatNumber(live.login.button.h)} | local=${formatNumber(local.login.button.w)}x${formatNumber(local.login.button.h)}`
  );
  console.log(
    `Login icon  | live=${formatNumber(live.login.graphic.w)}x${formatNumber(live.login.graphic.h)} | local=${formatNumber(local.login.graphic.w)}x${formatNumber(local.login.graphic.h)}`
  );
}

function renderHoverReport(snapshots) {
  const liveItem = snapshots.live.nav.items[0];
  const localItem = snapshots.local.nav.items[0];

  printSection("HOVER");

  console.log("LIVE first item");
  console.log(
    `  labelWidth=${formatNumber(liveItem.label.w)} | rootWidth=${formatNumber(liveItem.root.w)} | bg=${liveItem.root.styles.backgroundColor} | color=${liveItem.label.styles.color}`
  );
  console.log(
    `  padding=${liveItem.root.styles.paddingTop} ${liveItem.root.styles.paddingRight} ${liveItem.root.styles.paddingBottom} ${liveItem.root.styles.paddingLeft} | radius=${liveItem.root.styles.borderRadius}`
  );

  console.log("\nLOCAL first item");
  console.log(
    `  labelWidth=${formatNumber(localItem.label.w)} | rootWidth=${formatNumber(localItem.root.w)} | effectivePillWidth=${formatNumber(getEffectiveRootWidth(localItem))}`
  );
  console.log(
    `  textColor=${localItem.label.styles.color} | rootBg=${localItem.root.styles.backgroundColor} | beforeBg=${localItem.root.before.backgroundColor}`
  );
  console.log(
    `  padding=${localItem.root.styles.paddingTop} ${localItem.root.styles.paddingRight} ${localItem.root.styles.paddingBottom} ${localItem.root.styles.paddingLeft} | beforeLeft=${localItem.root.before.left} | beforeRight=${localItem.root.before.right}`
  );
}

function renderResponsiveReport(responsiveData) {
  printSection("RESPONSIVE");

  RESPONSIVE_BREAKPOINTS.forEach((width, index) => {
    const live = responsiveData.live[index];
    const local = responsiveData.local[index];

    console.log(
      `${width}px | header live=${formatNumber(live.headerHeight)} local=${formatNumber(local.headerHeight)} | logo=${live.logoVisible}/${local.logoVisible} | nav=${live.navVisible}/${local.navVisible} | login=${live.loginVisible}/${local.loginVisible}`
    );
  });
}

async function run() {
  const options = parseArgs();
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();

  try {
    const snapshots = {};
    const hoverSnapshots = {};
    const responsiveData = { live: [], local: [] };

    if (options.mode !== "responsive") {
      for (const target of TARGETS) {
        snapshots[target.name] = await collectSnapshot(page, target, options, false);
      }
    }

    if (options.mode === "hover" || options.mode === "all") {
      for (const target of TARGETS) {
        hoverSnapshots[target.name] = await collectSnapshot(page, target, options, true);
      }
    }

    if (options.mode === "responsive" || options.mode === "all") {
      for (const target of TARGETS) {
        for (const width of RESPONSIVE_BREAKPOINTS) {
          responsiveData[target.name].push(
            await collectResponsiveState(page, target, options, width)
          );
        }
      }
    }

    switch (options.mode) {
      case "summary":
        renderSummary(snapshots);
        break;
      case "nav":
        renderNavReport(snapshots);
        break;
      case "components":
        renderComponentsReport(snapshots);
        break;
      case "hover":
        renderHoverReport(hoverSnapshots);
        break;
      case "responsive":
        renderResponsiveReport(responsiveData);
        break;
      case "all":
        renderNavReport(snapshots);
        renderComponentsReport(snapshots);
        renderHoverReport(hoverSnapshots);
        renderResponsiveReport(responsiveData);
        break;
      default:
        throw new Error(`Modo no soportado: ${options.mode}`);
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
