const fs = require('fs');
const path = require('path');

const {
  walk,
  isHtmlFile,
  toPosix,
  buildLocalMirrorBase,
  buildLocalMirrorUrl,
  getLocalBaseUrl
} = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOCAL_BASE = getLocalBaseUrl();
const LOCAL_ORIGIN = new URL(LOCAL_BASE).origin;
const REPORT_MD = path.resolve(__dirname, '..', 'THIRD-PARTY-CLEAN-REPORT.md');
const REPORT_JSON = path.resolve(__dirname, '..', 'THIRD-PARTY-CLEAN-REPORT.json');

const TWIPLA_APP_DEFINITION_ID = '13ee53b4-2343-b641-c84d-056d2e6ed2e6';
const THIRD_PARTY_PATTERNS = {
  linkedin: /_linkedin_partner_id|snap\.licdn\.com|px\.ads\.linkedin\.com/i,
  sentry: /sentry-next\.wixpress\.com|browser\.sentry-cdn\.com|window\.Sentry|Sentry\.init|configureScope|makeMultiplexedTransport|moduleMetadataIntegration|sentryOnLoad|Invalid Sentry Dsn/i,
  twipla: /visitor-analytics\.io|TWIPLA Website Intelligence|statcounter\.va-endpoint\.com/i,
  telemetry: /frog\.wix\.com|panorama\.wixapps\.net/i,
  tagManager: /tag-manager\/api\/v1\/tags\/sites/i
};

const TELEMETRY_GUARD_ID = 'deh-telemetry-guard';
const FEDOPS_STUB_ID = 'deh-fedops-stub';
const TELEMETRY_GUARD_SCRIPT = `<script id="${TELEMETRY_GUARD_ID}">(function(){var blocked=/(^https?:)?\\/\\/(frog\\.wix\\.com|panorama\\.wixapps\\.net|auto\\.srv791713\\.hstgr\\.cloud)\\//i;var localOrigin=${JSON.stringify(LOCAL_ORIGIN)};function isBlocked(v){return typeof v==='string'&&blocked.test(v)}window.fedops=window.fedops||{};window.fedops.apps=window.fedops.apps||{};window.fedops.phaseStarted=window.fedops.phaseStarted||function(){return function(){}};window.fedops.phaseEnded=window.fedops.phaseEnded||function(){return function(){}};window.fedops.reportError=window.fedops.reportError||function(){};var NativeWorker=window.Worker;if(typeof NativeWorker==='function'){var workerOrigin=window.location.protocol+'//'+window.location.hostname+(window.location.port?':'+window.location.port:'');window.Worker=function(url,options){var nextUrl=url;if(typeof url==='string'){var prefix=localOrigin+'/'+window.location.hostname+'/';if(url.indexOf(prefix)===0){nextUrl=workerOrigin+'/'+url.slice(prefix.length)}}return new NativeWorker(nextUrl,options)};window.Worker.prototype=NativeWorker.prototype}var origFetch=window.fetch;if(typeof origFetch==='function'){window.fetch=function(input,init){var url=typeof input==='string'?input:(input&&input.url)||'';if(isBlocked(url)){return Promise.resolve(new Response('',{status:204,statusText:'No Content'}))}return origFetch.call(this,input,init)}}var origOpen=XMLHttpRequest&&XMLHttpRequest.prototype&&XMLHttpRequest.prototype.open;if(origOpen){XMLHttpRequest.prototype.open=function(method,url){this.__dehBlockedTelemetry=isBlocked(url);return origOpen.apply(this,arguments)};var origSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(body){if(this.__dehBlockedTelemetry){try{this.readyState=4;this.status=204}catch(_e){}return}return origSend.call(this,body)}}var origBeacon=navigator.sendBeacon;if(typeof origBeacon==='function'){navigator.sendBeacon=function(url,data){if(isBlocked(url)){return true}return origBeacon.call(this,url,data)}}if(window.Image&&window.Image.prototype){var desc=Object.getOwnPropertyDescriptor(window.Image.prototype,'src');if(desc&&desc.set){Object.defineProperty(window.Image.prototype,'src',{configurable:true,enumerable:desc.enumerable,get:desc.get,set:function(value){if(isBlocked(value)){return value}return desc.set.call(this,value)}})}}})();</script>`;
const FEDOPS_STUB_SCRIPT = `<script id="${FEDOPS_STUB_ID}">(function(){window.fedops=window.fedops||{};window.fedops.apps=window.fedops.apps||{};window.fedops.phaseStarted=window.fedops.phaseStarted||function(){return function(){}};window.fedops.phaseEnded=window.fedops.phaseEnded||function(){return function(){}};window.fedops.reportError=window.fedops.reportError||function(){};})();</script>`;
const THUNDERBOLT_SCRIPT_PATTERN = /wix-thunderbolt|thunderbolt-platform|thunderbolt-features|thunderbolt\/dist/i;
const THUNDERBOLT_PRELOAD_PATTERN = /siteassets\.parastorage\.com\/pages\/pages\/thunderbolt|static\.parastorage\.com\/services\/search-app|static\.parastorage\.com\/services\/form-app/i;
const EXTERNAL_FONT_PATTERN = /fonts\.googleapis\.com|fonts\.gstatic\.com/i;
const EXTERNAL_CHAT_PATTERN = /cdn\.jsdelivr\.net\/gh\/SoporteSquads\/SquadsChat|auto\.srv791713\.hstgr\.cloud/i;

function localizeWixAssetUrl(urlText) {
  if (typeof urlText !== 'string' || !urlText) return urlText;

  let next = urlText;

  next = next.replace(
    /https?:\/\/www\.dehonline\.es\/_partials\/wix-thunderbolt\/dist\/([^"'`\s<)]+)/gi,
    '/_partials/wix-thunderbolt/dist/$1'
  );

  next = next.replace(
    /https?:\/\/static\.parastorage\.com\/unpkg\/([^"'`\s<)]+)/gi,
    '/assets/js/unpkg/$1'
  );

  next = next.replace(
    /https?:\/\/static\.parastorage\.com\/services\/([^"'`\s<)]+?\.css)(?=["'`\s<)]|$)/gi,
    '/assets/css/services/$1'
  );

  next = next.replace(
    /https?:\/\/static\.parastorage\.com\/services\/([^"'`\s<)]+?)(?=["'`\s<)]|$)/gi,
    '/assets/js/services/$1'
  );

  next = next.replace(
    /https?:\/\/static\.parastorage\.com\/pages\/pages\/([^"'`\s<)]+)(?=["'`\s<)]|$)/gi,
    '/assets/misc/pages/pages/$1'
  );

  next = next.replace(
    /https?:\/\/siteassets\.parastorage\.com\/([^"'`\s<)]+)(?=["'`\s<)]|$)/gi,
    '/assets/misc/siteassets.parastorage.com/$1'
  );

  next = next.replace(
    /https?:\/\/static\.wixstatic\.com\/media\/([^"'`\s<)]+)(?=["'`\s<)]|$)/gi,
    '/assets/img/media/$1'
  );

  next = next.replace(
    /https?:\/\/static\.wixstatic\.com\/([^"'`\s<)]+)(?=["'`\s<)]|$)/gi,
    '/assets/misc/static.wixstatic.com/$1'
  );

  next = next.replace(
    /https?:\/\/video\.wixstatic\.com\/([^"'`\s<)]+)(?=["'`\s<)]|$)/gi,
    '/assets/misc/video.wixstatic.com/$1'
  );

  return next;
}

function rewriteKnownExternalAssets(text) {
  return localizeWixAssetUrl(text)
    .replace(/https?:\/\/static\.wixstatic\.com(?=\/|")/gi, '/assets/misc/static.wixstatic.com')
    .replace(/https?:\/\/video\.wixstatic\.com(?=\/|")/gi, '/assets/misc/video.wixstatic.com')
    .replace(/https?:\/\/static\.parastorage\.com\/unpkg(?=\/|")/gi, '/assets/js/unpkg')
    .replace(/https?:\/\/static\.parastorage\.com\/services(?=\/|")/gi, '/assets/js/services')
    .replace(/https?:\/\/static\.parastorage\.com(?=\/|")/gi, '/assets/js')
    .replace(/https?:\/\/viewer-apps\.parastorage\.com(?=\/|")/gi, '/assets/misc/viewer-apps.parastorage.com')
    .replace(/https?:\/\/viewer-assets\.parastorage\.com(?=\/|")/gi, '/assets/misc/viewer-assets.parastorage.com')
    .replace(/https?:\/\/siteassets\.parastorage\.com(?=\/|")/gi, '/assets/misc/siteassets.parastorage.com')
    .replace(/https?:\/\/pages\.parastorage\.com(?=\/|")/gi, '')
    .replace(/https?:\/\/staticorigin\.wixstatic\.com(?=\/|")/gi, '')
    .replace(/https?:\/\/fallback\.wix\.com(?=\/|")/gi, '')
    .replace(/https?:\/\/(?:www\.wix\.com|apps\.wix\.com|bookings\.wixapps\.net)(?=\/|")/gi, '')
    .replace(/https?:\/\/www-dehonline-es\.filesusr\.com(?=\/|")/gi, '/assets/misc/www-dehonline-es.filesusr.com')
    .replace(/https?:\/\/cdn\.jsdelivr\.net\/gh\/SoporteSquads\/SquadsChat[^"'`\s<)]*/gi, '')
    .replace(/https?:\/\/auto\.srv791713\.hstgr\.cloud\/[^"'`\s<)]*/gi, '')
    .replace(/https?:\/\/browser\.sentry-cdn\.com\/[^"'`\s<)]*/gi, '')
    .replace(/https?:\/\/[^"'`\s<)]*@sentry(?:-next)?\.wixpress\.com\/[^"'`\s<)]*/gi, '')
    .replace(/https?:\/\/fonts\.googleapis\.com\/[^"'`\s<)]*/gi, '')
    .replace(/https?:\/\/fonts\.gstatic\.com\/[^"'`\s<)]*/gi, '');
}

function parseArgs(argv) {
  const options = {
    write: true,
    filter: '',
    limit: 0,
    paths: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.write = false;
    else if (arg === '--filter') options.filter = String(argv[++i] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[++i] || 0);
    else options.paths.push(path.resolve(process.cwd(), arg));
  }

  return options;
}

function detectSignatures(text) {
  const detected = [];
  for (const [name, pattern] of Object.entries(THIRD_PARTY_PATTERNS)) {
    if (pattern.test(text)) detected.push(name);
  }
  return detected;
}

function removeMatchingScriptBlocks(text, pattern) {
  let count = 0;
  const next = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    if (/id="wix-viewer-model"|id='wix-viewer-model'|type="application\/json"|type='application\/json'/i.test(block)) {
      return block;
    }
    if (pattern.test(block)) {
      count += 1;
      return '';
    }
    return block;
  });
  return { text: next, count };
}

function removeMatchingNoscriptBlocks(text, pattern) {
  let count = 0;
  const next = text.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, (block) => {
    if (pattern.test(block)) {
      count += 1;
      return '';
    }
    return block;
  });
  return { text: next, count };
}

function removeMatchingComments(text, pattern) {
  let count = 0;
  const next = text.replace(/<!--([\s\S]*?)-->/g, (block) => {
    if (pattern.test(block)) {
      count += 1;
      return '';
    }
    return block;
  });
  return { text: next, count };
}

function removeMatchingLinkBlocks(text, pattern) {
  let count = 0;
  const next = text.replace(/<link\b[^>]*>/gi, (block) => {
    if (pattern.test(block)) {
      count += 1;
      return '';
    }
    return block;
  });
  return { text: next, count };
}

function buildLocalUrl(relPath) {
  const posixRel = toPosix(relPath);
  if (!posixRel.startsWith('sites/')) return LOCAL_BASE;
  const parts = posixRel.split('/');
  parts.shift();
  const domain = parts.shift();
  const rest = parts.join('/');
  const route = ('/' + rest).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/\/+/g, '/');
  return shouldUseHostBasedMirror(domain)
    ? buildHostBasedLocalUrl(domain, route)
    : buildLocalMirrorUrl(domain, route, LOCAL_BASE);
}

function buildLocalSiteBase(relPath) {
  const posixRel = toPosix(relPath);
  if (!posixRel.startsWith('sites/')) return LOCAL_BASE.replace(/\/+$/, '');
  const parts = posixRel.split('/');
  parts.shift();
  const domain = parts.shift();
  return shouldUseHostBasedMirror(domain)
    ? buildHostBasedLocalUrl(domain, '/').replace(/\/+$/, '')
    : buildLocalMirrorBase(domain, LOCAL_BASE);
}

function buildHostBasedLocalUrl(domain, route = '/') {
  const base = new URL(LOCAL_BASE);
  const cleanRoute = !route || route === '/' ? '/' : `/${String(route).replace(/^\/+/, '')}`;
  return `${base.protocol}//${domain}${base.port ? `:${base.port}` : ''}${cleanRoute}`;
}

function shouldUseHostBasedMirror(domain) {
  return /^(soporte\.dehonline\.es|www\.soporte\.dehonline\.es|www\.consola\.dehonline\.es)$/i.test(domain);
}

function rewriteSiteRootUrl(urlText, localSiteBase, localOrigin) {
  try {
    const url = new URL(urlText);
    const defaultLocalOrigin = new URL(LOCAL_BASE).origin;
    if (
      url.origin !== localOrigin &&
      url.origin !== defaultLocalOrigin &&
      !/(^|\.)dehonline\.es$/i.test(url.hostname)
    ) {
      return urlText;
    }
    const suffix = `${url.pathname || ''}${url.search || ''}${url.hash || ''}`;
    const base = localSiteBase.replace(/\/+$/, '');
    return suffix && suffix !== '/' ? `${base}${suffix}` : base;
  } catch {
    return urlText;
  }
}

function patchViewerJson(jsonText, changes, localUrl, localSiteBase) {
      let viewerModel;
      try {
        viewerModel = JSON.parse(jsonText);
      } catch (_error) {
        changes.pending.push('viewerModel parse failed');
        return jsonText;
      }

      const localOrigin = new URL(localUrl).origin;

      if (viewerModel && typeof viewerModel.requestUrl === 'string') {
        viewerModel.requestUrl = localUrl;
      }
      if (viewerModel && typeof viewerModel.accessTokensUrl === 'string') {
        viewerModel.accessTokensUrl = viewerModel.accessTokensUrl.replace(/^https?:\/\/[^/]+/i, localOrigin);
      }
      if (viewerModel && viewerModel.site && typeof viewerModel.site.externalBaseUrl === 'string') {
        viewerModel.site.externalBaseUrl = localSiteBase;
      }
      if (viewerModel && viewerModel.siteAssets && viewerModel.siteAssets.clientTopology) {
        const topology = viewerModel.siteAssets.clientTopology;
        if (typeof topology.pageJsonServerUrls === 'object' && Array.isArray(topology.pageJsonServerUrls)) {
          topology.pageJsonServerUrls = topology.pageJsonServerUrls.map((url) => rewriteSiteRootUrl(url, localSiteBase, localOrigin));
        }
      }

      if (viewerModel && viewerModel.experiments && typeof viewerModel.experiments === 'object') {
        const removableExperiments = [
          'specs.thunderbolt.businessLoggerService',
          'specs.thunderbolt.fedops_enableSampleRateForAppNames',
          'specs.thunderbolt.fedopsMuteErrors',
          'specs.thunderbolt.InitPlatformApiProvider',
          'specs.thunderbolt.loadNewerSentrySdk',
          'specs.thunderbolt.moveFedopsLoadStartToBody',
          'specs.thunderbolt.Panorama',
          'specs.thunderbolt.PanoramaErrorMonitor',
          'specs.thunderbolt.sendFedopsLoadStartedReplaced',
          'specs.thunderbolt.useNewTelemetryAPI'
        ];
        for (const experiment of removableExperiments) {
          if (experiment in viewerModel.experiments) {
            delete viewerModel.experiments[experiment];
            changes.removed.push(`viewerModel.experiments.${experiment}`);
          }
        }
      }

      if (Array.isArray(viewerModel?.siteFeatures)) {
        const removableFeatures = new Set(['panorama']);
        const before = viewerModel.siteFeatures.length;
        viewerModel.siteFeatures = viewerModel.siteFeatures.filter((feature) => !removableFeatures.has(feature));
        const removed = before - viewerModel.siteFeatures.length;
        if (removed > 0) {
          changes.removed.push(`viewerModel.siteFeatures (${removed})`);
        }
        if (!viewerModel.siteFeatures.includes('appMonitoring')) {
          viewerModel.siteFeatures.push('appMonitoring');
        }
        if (!viewerModel.siteFeatures.includes('businessLogger')) {
          viewerModel.siteFeatures.push('businessLogger');
        }
      }

      const configs = viewerModel && viewerModel.siteFeaturesConfigs;
      if (!configs) {
        changes.pending.push('viewerModel without siteFeaturesConfigs');
      } else {
        if (!configs.appMonitoring) {
          configs.appMonitoring = {};
        }
        if (!configs.businessLogger) {
          configs.businessLogger = {};
        }
        if (configs.codeEmbed && Array.isArray(configs.codeEmbed.htmlEmbeds)) {
          const before = configs.codeEmbed.htmlEmbeds.length;
          configs.codeEmbed.htmlEmbeds = configs.codeEmbed.htmlEmbeds.filter((embed) => {
            const html = embed && embed.content && embed.content.html || '';
            return !(
              THIRD_PARTY_PATTERNS.linkedin.test(html) ||
              THIRD_PARTY_PATTERNS.sentry.test(html) ||
              THIRD_PARTY_PATTERNS.twipla.test(html)
            );
          });
          if (configs.codeEmbed.htmlEmbeds.length !== before) {
            changes.removed.push(`viewerModel.codeEmbed (${before - configs.codeEmbed.htmlEmbeds.length})`);
          }
        }

        if (configs.tpaWorkerFeature && configs.tpaWorkerFeature.tpaWorkers) {
          for (const [workerId, worker] of Object.entries(configs.tpaWorkerFeature.tpaWorkers)) {
            if (worker && worker.appDefinitionId === TWIPLA_APP_DEFINITION_ID) {
              delete configs.tpaWorkerFeature.tpaWorkers[workerId];
              changes.removed.push(`viewerModel.tpaWorkerFeature.${workerId}`);
            }
          }
        }

        const widgets = configs.tpaCommons && configs.tpaCommons.widgetsClientSpecMapData;
        if (widgets) {
          for (const [widgetId, widget] of Object.entries(widgets)) {
            if (widget && widget.appDefinitionId === TWIPLA_APP_DEFINITION_ID) {
              delete widgets[widgetId];
              changes.removed.push(`viewerModel.tpaCommons.widgetsClientSpecMapData.${widgetId}`);
            }
          }
        }

        const apps = configs.tpaCommons && configs.tpaCommons.appsClientSpecMapData;
        if (apps && apps[TWIPLA_APP_DEFINITION_ID]) {
          delete apps[TWIPLA_APP_DEFINITION_ID];
          changes.removed.push(`viewerModel.tpaCommons.appsClientSpecMapData.${TWIPLA_APP_DEFINITION_ID}`);
        }

        const freeSiteWidgets = configs.wixCustomElementComponent && configs.wixCustomElementComponent.widgetsToRenderOnFreeSites;
        if (freeSiteWidgets && widgets) {
          for (const widgetId of Object.keys(freeSiteWidgets)) {
            if (!widgets[widgetId] && freeSiteWidgets[widgetId]) {
              delete freeSiteWidgets[widgetId];
              changes.removed.push(`viewerModel.wixCustomElementComponent.widgetsToRenderOnFreeSites.${widgetId}`);
            }
          }
        }
      }

      const serialized = JSON.stringify(viewerModel)
        .replace(/</g, '\\u003c')
        .replace(/-->/g, '--\\u003e');
      return rewriteKnownExternalAssets(serialized);
}

function patchViewerModel(text, changes, relPath) {
  const localUrl = buildLocalUrl(relPath);
  const localSiteBase = buildLocalSiteBase(relPath);
  return text
    .replace(
      /<script type="application\/json" id="wix-essential-viewer-model">([\s\S]*?)<\/script>/,
      (_match, jsonText) => `<script type="application/json" id="wix-essential-viewer-model">${patchViewerJson(jsonText, changes, localUrl, localSiteBase)}</script>`
    )
    .replace(
      /<script type="application\/json" id="wix-viewer-model">([\s\S]*?)<\/script>/,
      (_match, jsonText) => `<script type="application/json" id="wix-viewer-model">${patchViewerJson(jsonText, changes, localUrl, localSiteBase)}</script>`
    );
}

function injectTelemetryGuard(text, changes) {
  const withoutExisting = text.replace(new RegExp(`<script[^>]+id=["']${TELEMETRY_GUARD_ID}["'][^>]*>[\\s\\S]*?<\\/script>`, 'i'), '');
  if (withoutExisting !== text) {
    changes.removed.push('telemetry guard refresh');
  } else {
    changes.removed.push('telemetry guard');
  }
  if (/<head\b[^>]*>/i.test(withoutExisting)) {
    return withoutExisting.replace(/<head\b[^>]*>/i, (match) => `${match}\n${TELEMETRY_GUARD_SCRIPT}`);
  }
  if (/<\/head>/i.test(withoutExisting)) {
    return withoutExisting.replace(/<\/head>/i, `${TELEMETRY_GUARD_SCRIPT}</head>`);
  }
  return `${TELEMETRY_GUARD_SCRIPT}${withoutExisting}`;
}

function injectFedopsStub(text, changes) {
  const withoutExisting = text.replace(new RegExp(`<script[^>]+id=["']${FEDOPS_STUB_ID}["'][^>]*>[\\s\\S]*?<\\/script>`, 'i'), '');
  if (/window\.fedops\s*=\s*JSON\.parse\(document\.getElementById\(['"]wix-fedops['"]\)\.textContent\)/i.test(withoutExisting)) {
    changes.removed.push('fedops stub');
    return withoutExisting.replace(
      /(window\.fedops\s*=\s*JSON\.parse\(document\.getElementById\(['"]wix-fedops['"]\)\.textContent\)\s*<\/script>)/i,
      `$1${FEDOPS_STUB_SCRIPT}`
    );
  }
  if (/<\/body>/i.test(withoutExisting)) {
    changes.removed.push('fedops stub');
    return withoutExisting.replace(/<\/body>/i, `${FEDOPS_STUB_SCRIPT}</body>`);
  }
  return withoutExisting;
}

function sanitizeHtml(text, changes, relPath) {
  let next = text;

  const linkedInScripts = removeMatchingScriptBlocks(next, THIRD_PARTY_PATTERNS.linkedin);
  next = linkedInScripts.text;
  if (linkedInScripts.count) changes.removed.push(`linkedin script blocks (${linkedInScripts.count})`);

  const sentryScripts = removeMatchingScriptBlocks(next, THIRD_PARTY_PATTERNS.sentry);
  next = sentryScripts.text;
  if (sentryScripts.count) changes.removed.push(`sentry script blocks (${sentryScripts.count})`);

  const twiplaScripts = removeMatchingScriptBlocks(next, THIRD_PARTY_PATTERNS.twipla);
  next = twiplaScripts.text;
  if (twiplaScripts.count) changes.removed.push(`twipla script blocks (${twiplaScripts.count})`);

  const telemetryScripts = removeMatchingScriptBlocks(next, THIRD_PARTY_PATTERNS.telemetry);
  next = telemetryScripts.text;
  if (telemetryScripts.count) changes.removed.push(`telemetry script blocks (${telemetryScripts.count})`);

  const linkedInNoscript = removeMatchingNoscriptBlocks(next, THIRD_PARTY_PATTERNS.linkedin);
  next = linkedInNoscript.text;
  if (linkedInNoscript.count) changes.removed.push(`linkedin noscript blocks (${linkedInNoscript.count})`);

  const externalFontLinks = removeMatchingLinkBlocks(next, EXTERNAL_FONT_PATTERN);
  next = externalFontLinks.text;
  if (externalFontLinks.count) changes.removed.push(`external font links (${externalFontLinks.count})`);

  const externalChatLinks = removeMatchingLinkBlocks(next, EXTERNAL_CHAT_PATTERN);
  next = externalChatLinks.text;
  if (externalChatLinks.count) changes.removed.push(`external chat links (${externalChatLinks.count})`);

  next = next.replace(/<link\b[^>]*cdn\.jsdelivr\.net\/gh\/SoporteSquads\/SquadsChat[^>]*>/gi, () => {
    changes.removed.push('external chat stylesheet');
    return '';
  });

  const sentryComments = removeMatchingComments(next, THIRD_PARTY_PATTERNS.sentry);
  next = sentryComments.text;
  if (sentryComments.count) changes.removed.push(`sentry comments (${sentryComments.count})`);

  if (/search\.html|carpetas-financieras\.html/i.test(relPath)) {
    const thunderboltScripts = removeMatchingScriptBlocks(next, THUNDERBOLT_SCRIPT_PATTERN);
    next = thunderboltScripts.text;
    if (thunderboltScripts.count) changes.removed.push(`thunderbolt scripts (${thunderboltScripts.count})`);

    const thunderboltPreloads = removeMatchingLinkBlocks(next, THUNDERBOLT_PRELOAD_PATTERN);
    next = thunderboltPreloads.text;
    if (thunderboltPreloads.count) changes.removed.push(`thunderbolt preloads (${thunderboltPreloads.count})`);
  }

  if (/search\.html|carpetas-financieras\.html/i.test(relPath)) {
    const before = next;
    next = next
      .replace(/<script type="application\/json" id="wix-essential-viewer-model">[\s\S]*?<\/script>/i, '')
      .replace(/<script type="application\/json" id="wix-viewer-model">[\s\S]*?<\/script>/i, '');
    if (next !== before) changes.removed.push(/search\.html/i.test(relPath) ? 'search viewer models' : 'carpetas viewer models');
  }

  next = next.replace(/<iframe\b([^>]*?(visitor-analytics\.io|TWIPLA Website Intelligence)[^>]*)><\/iframe>/gi, () => {
    changes.removed.push('twipla iframe');
    return '';
  });

  next = next.replace(/allowvr="true"/gi, () => {
    changes.removed.push('allowvr attribute');
    return '';
  });

  next = next.replace(/allow="([^"]*?)\bvr\b;?([^"]*)"/gi, (_m, before, after) => {
    changes.removed.push('iframe allow vr token');
    return `allow="${`${before};${after}`.split(';').map((item) => item.trim()).filter(Boolean).join(';')}"`;
  });

  if (/search\.html|carpetas-financieras\.html/i.test(relPath)) {
    next = injectTelemetryGuard(next, changes);
    next = injectFedopsStub(next, changes);
    return rewriteKnownExternalAssets(next);
  }

  const hasViewerModel = /<script type="application\/json" id="wix-essential-viewer-model">|<script type="application\/json" id="wix-viewer-model">/i.test(next);
  const hasThunderboltScripts = /<script\b[^>]*(?:wix-thunderbolt|thunderbolt-platform|thunderbolt-features|thunderbolt\/dist)[^>]*>/i.test(next);
  const isStaticizedPage = /<!--\s*staticized:/i.test(next)
    && !hasViewerModel
    && !hasThunderboltScripts;

  if (!isStaticizedPage) {
    next = patchViewerModel(next, changes, relPath);
    next = injectTelemetryGuard(next, changes);
    next = injectFedopsStub(next, changes);
  }

  return rewriteKnownExternalAssets(next);
}

function formatReport(results, options) {
  let md = '# Limpieza de terceros\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Escritura activada: ${options.write ? 'si' : 'no'}\n`;
  md += `- Archivos procesados: ${results.length}\n\n`;
  md += '| Archivo | Detectado | Eliminado | Pendiente | Modificado |\n|---|---|---|---|---|\n';
  for (const item of results) {
    md += `| ${item.relPath} | ${item.detected.join(', ') || '-'} | ${item.removed.length} | ${item.pending.length} | ${item.modified ? 'si' : 'no'} |\n`;
  }
  md += '\n';

  for (const item of results) {
    md += `## ${item.relPath}\n\n`;
    md += `- Detectado: ${item.detected.join(', ') || '-'}\n`;
    md += `- Eliminado: ${item.removed.join(' | ') || '-'}\n`;
    md += `- Pendiente: ${item.pending.join(' | ') || '-'}\n`;
    md += `- Modificado: ${item.modified ? 'si' : 'no'}\n\n`;
  }

  return md;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const allHtmlFiles = walk(PROJECT_ROOT)
    .filter(isHtmlFile)
    .filter((filePath) => !/[/\\](node_modules|scripts)[/\\]/.test(filePath))
    .filter((filePath) => {
      const rel = toPosix(path.relative(PROJECT_ROOT, filePath));
      return rel.startsWith('sites/') || rel.startsWith('public/assets/') || rel.startsWith('public/docs/');
    });
  let files = options.paths.length ? options.paths : allHtmlFiles;
  files = files.filter((filePath) => filePath.startsWith(PROJECT_ROOT) && fs.existsSync(filePath));

  if (options.filter) {
    files = files.filter((filePath) => toPosix(path.relative(PROJECT_ROOT, filePath)).toLowerCase().includes(options.filter));
  }
  if (options.limit > 0) files = files.slice(0, options.limit);

  const results = [];

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    const relPath = toPosix(path.relative(PROJECT_ROOT, filePath));
    const detected = detectSignatures(original);
    const changes = { removed: [], pending: [] };
    const cleaned = sanitizeHtml(original, changes, relPath);
    const remaining = detectSignatures(cleaned);
    const modified = cleaned !== original;

    for (const name of remaining) {
      if (!changes.pending.includes(name)) changes.pending.push(name);
    }

    if (modified && options.write) {
      fs.writeFileSync(filePath, cleaned);
    }

    results.push({
      filePath,
      relPath,
      detected,
      removed: changes.removed,
      pending: changes.pending,
      modified
    });
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));
  fs.writeFileSync(REPORT_MD, formatReport(results, options));

  const summary = {
    processed: results.length,
    modified: results.filter((item) => item.modified).length,
    report: REPORT_MD,
    jsonReport: REPORT_JSON
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
