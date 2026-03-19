(function () {
  var localMediaCache = new Map();
  var localMediaPathCache = new Map();
  var avatarManifestPromise = null;

  function placeholderSvgDataUri() {
    var svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">',
      '<rect width="64" height="64" rx="32" fill="#e6ebf2"/>',
      '<circle cx="32" cy="24" r="12" fill="#a9b4c4"/>',
      '<path d="M14 54c3-10 11-16 18-16s15 6 18 16" fill="#a9b4c4"/>',
      '</svg>'
    ].join('');
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function normalizeMediaBasename(value) {
    if (!value) return '';
    var raw = String(value).trim();
    if (!raw) return '';

    if (/^\/assets\/img\/media\//i.test(raw)) {
      return safeDecodeURIComponent(raw.replace(/^\/assets\/img\/media\//i, '').split(/[/?#]/)[0]);
    }

    var wixMatch = raw.match(/\/media\/([^/?#]+)/i);
    if (wixMatch) {
      return safeDecodeURIComponent(wixMatch[1]);
    }

    if (/^https?:/i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw) || /^\/\//.test(raw)) {
      return '';
    }

    return safeDecodeURIComponent(raw.replace(/^\/+/, '').split(/[/?#]/)[0]);
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function normalizeLocalMediaPath(value) {
    if (!value) return '';
    var raw = String(value).trim();
    if (!raw) return '';

    if (/^\/assets\/img\/media\//i.test(raw)) {
      return raw.split('#')[0];
    }

    if (/^\/assets\/misc\/static\.wixstatic\.com\/media\//i.test(raw)) {
      return raw.split('#')[0];
    }

    if (/^\/media\//i.test(raw)) {
      return ('/assets/img' + raw).split('#')[0];
    }

    if (/^https?:/i.test(raw) || /^\/\//.test(raw)) {
      try {
        var url = new URL(raw, window.location.origin);
        if (/\/assets\/img\/media\//i.test(url.pathname)) {
          return (url.pathname + url.search).split('#')[0];
        }
        if (/\/assets\/misc\/static\.wixstatic\.com\/media\//i.test(url.pathname)) {
          return (url.pathname + url.search).split('#')[0];
        }
        var mediaIndex = url.pathname.toLowerCase().indexOf('/media/');
        if (mediaIndex >= 0) {
          return ('/assets/img' + url.pathname.slice(mediaIndex) + url.search).split('#')[0];
        }
      } catch (_error) {
        return '';
      }
    }

    var basename = normalizeMediaBasename(raw);
    return basename ? '/assets/img/media/' + encodeURIComponent(basename) : '';
  }

  function localMediaUrlFromValue(value) {
    return normalizeLocalMediaPath(value);
  }

  function buildCanonicalLocalMediaPath(value) {
    var basename = normalizeMediaBasename(value);
    return basename ? '/assets/img/media/' + encodeURIComponent(basename) : '';
  }

  function uniqueNonEmpty(values) {
    var seen = {};
    var list = [];

    (values || []).forEach(function (value) {
      if (!value || seen[value]) return;
      seen[value] = true;
      list.push(value);
    });

    return list;
  }

  function extractSrcsetCandidates(srcsetValue) {
    if (!srcsetValue) return [];

    var candidates = [];
    srcsetValue.split(',').forEach(function (entry) {
      var chunk = String(entry || '').trim();
      if (!chunk) return;

      var parts = chunk.split(/\s+/);
      var urlPart = parts[0] || '';
      var descriptor = parts[1] || '';
      var score = 1;
      var widthMatch = descriptor.match(/^(\d+)w$/i);
      var densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/i);

      if (widthMatch) score = Number(widthMatch[1]) || 1;
      else if (densityMatch) score = (Number(densityMatch[1]) || 1) * 10000;

      candidates.push({
        path: normalizeLocalMediaPath(urlPart),
        score: score
      });
    });

    candidates.sort(function (a, b) {
      return b.score - a.score;
    });

    return uniqueNonEmpty(candidates.map(function (item) {
      return item.path;
    }));
  }

  function extractPictureSrcsetCandidates(picture) {
    if (!picture || !picture.querySelectorAll) return [];

    var list = [];
    picture.querySelectorAll('source').forEach(function (source) {
      list = list.concat(extractSrcsetCandidates(source.getAttribute('srcset') || ''));
    });
    return uniqueNonEmpty(list);
  }

  function isLowQualityMediaPath(value) {
    if (!value) return false;
    if (/blur_\d+/i.test(value)) return true;

    var sizeMatch = value.match(/\/w_(\d+),h_(\d+)/i);
    if (!sizeMatch) return false;

    var width = Number(sizeMatch[1] || 0);
    var height = Number(sizeMatch[2] || 0);
    if (!width || !height) return false;

    return width < 180 || height < 120;
  }

  function orderPreferredMediaPaths(candidates) {
    var sorted = uniqueNonEmpty(candidates);
    var high = [];
    var low = [];

    sorted.forEach(function (candidate) {
      if (isLowQualityMediaPath(candidate)) {
        low.push(candidate);
      } else {
        high.push(candidate);
      }
    });

    return high.concat(low);
  }

  function sanitizeSrcsetValue(value) {
    if (!value) return '';

    // Encode commas inside Wix media URLs so srcset does not split them.
    return String(value).replace(/,(?=\S)/g, '%2C');
  }

  function sanitizeLocalSrcset(root) {
    if (!root || !root.querySelectorAll) return;

    var nodes = root.querySelectorAll('img[srcset], source[srcset]');
    nodes.forEach(function (node) {
      var srcset = node.getAttribute('srcset') || '';
      if (!srcset) return;
      if (
        !/\/assets\/img\/media\//i.test(srcset) &&
        !/\/assets\/misc\/static\.wixstatic\.com\/media\//i.test(srcset) &&
        !/static\.wixstatic\.com\/media\//i.test(srcset)
      ) return;

      var sanitized = sanitizeSrcsetValue(srcset);
      if (sanitized !== srcset) {
        node.setAttribute('srcset', sanitized);
      }
    });
  }

  function checkLocalPathExists(localPath) {
    if (!localPath) return Promise.resolve(false);
    if (localMediaPathCache.has(localPath)) return localMediaPathCache.get(localPath);

    var request = fetch(localPath, {
      method: 'HEAD',
      cache: 'force-cache'
    }).then(function (response) {
      return response.ok;
    }).catch(function () {
      return false;
    });

    localMediaPathCache.set(localPath, request);
    return request;
  }

  function findFirstExistingLocalPath(candidates) {
    var queue = uniqueNonEmpty(candidates);

    function checkNext(index) {
      if (index >= queue.length) return Promise.resolve('');

      return checkLocalPathExists(queue[index]).then(function (exists) {
        if (exists) return queue[index];
        return checkNext(index + 1);
      });
    }

    return checkNext(0);
  }

  function checkLocalMediaExists(basename) {
    if (!basename) return Promise.resolve(false);
    if (localMediaCache.has(basename)) return localMediaCache.get(basename);

    var request = fetch('/assets/img/media/' + encodeURIComponent(basename), {
      method: 'HEAD',
      cache: 'force-cache'
    }).then(function (response) {
      return response.ok;
    }).catch(function () {
      return false;
    });

    localMediaCache.set(basename, request);
    return request;
  }

  function normalizeUrl(value) {
    if (!value) return '';
    var raw = String(value).trim();

    if (/^\/images-wixmp-[^/]+\.[^/]+\/.+/i.test(raw)) {
      return 'https:/' + raw;
    }

    try {
      return new URL(raw, window.location.origin).toString();
    } catch (_error) {
      return raw;
    }
  }

  function normalizeAuthorName(value) {
    return String(value || '')
      .replace(/^Foto del escritor:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeProfileHref(value) {
    if (!value) return '';

    var href = String(value).trim();
    if (!href) return '';

    href = href.replace(/^https?:\/\/www\.dehonline\.es/i, '');
    href = href.replace(/^\/?www\.dehonline\.es/i, '/www.dehonline.es');

    if (!href.startsWith('/')) href = '/' + href;

    return href;
  }

  function loadAvatarManifest() {
    if (avatarManifestPromise) return avatarManifestPromise;

    avatarManifestPromise = fetch('/assets/data/avatar-manifest.json', {
      cache: 'force-cache'
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    }).catch(function () {
      return null;
    });

    return avatarManifestPromise;
  }

  function resolveAvatarLocalUrl(manifest, options) {
    if (!manifest) return '';

    var sourceUrl = normalizeUrl(options && options.sourceUrl);
    var profileHref = normalizeProfileHref(options && options.profileHref);
    var authorName = normalizeAuthorName(options && options.authorName);

    if (sourceUrl && manifest.byUrl && manifest.byUrl[sourceUrl]) {
      return manifest.byUrl[sourceUrl];
    }

    if (profileHref && manifest.byProfileHref && manifest.byProfileHref[profileHref]) {
      return manifest.byProfileHref[profileHref];
    }

    if (authorName && manifest.byAuthorName && manifest.byAuthorName[authorName]) {
      return manifest.byAuthorName[authorName];
    }

    return '';
  }

  function parseImageInfo(el) {
    try {
      return JSON.parse(el.getAttribute('data-image-info') || el.dataset.imageInfo || '{}');
    } catch (_error) {
      return null;
    }
  }

  function ensureImageNode(el) {
    var img = el.querySelector('img');
    if (img) return img;
    img = document.createElement('img');
    el.appendChild(img);
    return img;
  }

  function applyImageStyles(img, imageInfo) {
    var info = imageInfo || {};
    var imageData = info.imageData || {};
    var displayMode = info.displayMode || imageData.displayMode || 'fill';
    var targetWidth = Number(info.targetWidth || imageData.width || img.getAttribute('width') || 0);
    var targetHeight = Number(info.targetHeight || imageData.height || img.getAttribute('height') || 0);
    var focalPoint = imageData.focalPoint;

    if (targetWidth && !img.getAttribute('width')) img.setAttribute('width', String(targetWidth));
    if (targetHeight && !img.getAttribute('height')) img.setAttribute('height', String(targetHeight));
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.style.width) img.style.width = '100%';
    if (!img.style.height) img.style.height = '100%';
    if (!img.style.display) img.style.display = 'block';
    if (!img.style.objectFit) img.style.objectFit = displayMode === 'fit' ? 'contain' : 'cover';
    if (!img.style.objectPosition && focalPoint && typeof focalPoint.x === 'number' && typeof focalPoint.y === 'number') {
      img.style.objectPosition = (focalPoint.x * 100) + '% ' + (focalPoint.y * 100) + '%';
    }
  }

  function markImageAsLoaded(img) {
    if (!img) return;

    function applyLoadedState() {
      img.setAttribute('data-load-done', 'true');
      var blurHost = (img.closest && img.closest('[data-animate-blur]')) || null;
      if (blurHost) {
        blurHost.removeAttribute('data-animate-blur');
      }
    }

    if (img.complete && img.naturalWidth > 0) {
      applyLoadedState();
      return;
    }

    img.addEventListener('load', applyLoadedState, { once: true });
  }

  function hydrateWowImage(el) {
    if (!el || el.dataset.dehImageFallback === 'done') return;

    var info = parseImageInfo(el);
    var img = ensureImageNode(el);
    var imageData = info && info.imageData ? info.imageData : {};
    var rawUri = imageData.uri || '';
    var currentSrc = img.getAttribute('src') || '';
    var localSrc = localMediaUrlFromValue(rawUri);
    var canonicalRawLocalSrc = buildCanonicalLocalMediaPath(rawUri);
    var currentLocalSrc = normalizeLocalMediaPath(currentSrc);
    var canonicalCurrentLocalSrc = buildCanonicalLocalMediaPath(currentSrc);
    var picture = el.querySelector('picture');
    var preferredCandidates = orderPreferredMediaPaths(
      uniqueNonEmpty(
        []
          .concat(extractSrcsetCandidates(img.getAttribute('srcset') || ''))
          .concat(extractPictureSrcsetCandidates(picture))
          .concat([currentLocalSrc, localSrc, canonicalRawLocalSrc, canonicalCurrentLocalSrc])
      )
    );
    var profileLink = el.closest('a[href*="/profile/"]');
    var authorName = normalizeAuthorName(img.getAttribute('alt'));
    var avatarLocalSrc = '';

    function setLocalImage(src, stripSrcset) {
      if (!src) return;
      img.setAttribute('src', src);
      if (stripSrcset) {
        img.removeAttribute('srcset');
        if (picture) {
          picture.querySelectorAll('source').forEach(function (source) {
            source.removeAttribute('srcset');
          });
        }
      }
      applyImageStyles(img, info);
      markImageAsLoaded(img);
      el.dataset.dehImageFallback = 'done';
    }

    el.style.display = el.style.display || 'block';
    avatarLocalSrc = resolveAvatarLocalUrl(window.__DEH_AVATAR_MANIFEST__, {
      sourceUrl: rawUri,
      profileHref: profileLink && profileLink.getAttribute('href'),
      authorName: authorName
    });

    if (avatarLocalSrc) {
      setLocalImage(avatarLocalSrc, true);
      return;
    }

    if (preferredCandidates.length > 0) {
      findFirstExistingLocalPath(preferredCandidates).then(function (resolvedPreferredSrc) {
        if (el.dataset.dehImageFallback === 'done') return;

        if (resolvedPreferredSrc) {
          setLocalImage(resolvedPreferredSrc, !/\/v1\//i.test(resolvedPreferredSrc));
          return;
        }

        var fallbackBasename = normalizeMediaBasename(rawUri || currentSrc || preferredCandidates[0]);
        checkLocalMediaExists(fallbackBasename).then(function (existsBase) {
          if (el.dataset.dehImageFallback === 'done') return;

          if (existsBase) {
            setLocalImage('/assets/img/media/' + encodeURIComponent(fallbackBasename), true);
            return;
          }

          avatarLocalSrc = resolveAvatarLocalUrl(window.__DEH_AVATAR_MANIFEST__, {
            sourceUrl: rawUri,
            profileHref: profileLink && profileLink.getAttribute('href'),
            authorName: authorName
          });

          if (avatarLocalSrc) {
            img.setAttribute('src', avatarLocalSrc);
            img.removeAttribute('srcset');
          } else if (!img.getAttribute('src')) {
            img.setAttribute('src', placeholderSvgDataUri());
          }

          applyImageStyles(img, info);
          el.dataset.dehImageFallback = 'done';
        });
      });
      return;
    }

    avatarLocalSrc = resolveAvatarLocalUrl(window.__DEH_AVATAR_MANIFEST__, {
      sourceUrl: rawUri,
      profileHref: profileLink && profileLink.getAttribute('href'),
      authorName: authorName
    });

    if (avatarLocalSrc) {
      img.setAttribute('src', avatarLocalSrc);
      img.removeAttribute('srcset');
      if (picture) {
        picture.querySelectorAll('source').forEach(function (source) {
          source.removeAttribute('srcset');
        });
      }
    } else if (!img.getAttribute('src')) {
      img.setAttribute('src', placeholderSvgDataUri());
    }

    applyImageStyles(img, info);
    el.dataset.dehImageFallback = 'done';
  }

  function promoteRemoteImgToLocal(img) {
    if (!img || img.dataset.dehImageFallback === 'done') return;

    var src = img.getAttribute('src') || '';
    var profileLink = img.closest && img.closest('a[href*="/profile/"]');
    var authorName = normalizeAuthorName(img.getAttribute('alt'));
    var avatarLocalSrc = resolveAvatarLocalUrl(window.__DEH_AVATAR_MANIFEST__, {
      sourceUrl: src,
      profileHref: profileLink && profileLink.getAttribute('href'),
      authorName: authorName
    });
    var preferredLocalSrc = normalizeLocalMediaPath(src);
    var basename = normalizeMediaBasename(src);
    var canonicalLocalSrc = buildCanonicalLocalMediaPath(src);
    var picture = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement : null;
    var candidateLocalPaths = orderPreferredMediaPaths(
      uniqueNonEmpty(
        []
          .concat(extractSrcsetCandidates(img.getAttribute('srcset') || ''))
          .concat(extractPictureSrcsetCandidates(picture))
          .concat([preferredLocalSrc, canonicalLocalSrc])
      )
    );
    if (candidateLocalPaths.length === 0 && !basename) return;

    function applyPromotedSrc(localPath) {
      if (!localPath) return;

      img.setAttribute('src', localPath);
      img.removeAttribute('srcset');
      if (picture) {
        picture.querySelectorAll('source').forEach(function (source) {
          source.removeAttribute('srcset');
        });
      }
      markImageAsLoaded(img);
      img.dataset.dehImageFallback = 'done';
    }

    if (avatarLocalSrc) {
      applyPromotedSrc(avatarLocalSrc);
      return;
    }

    var optimisticLocalPath = candidateLocalPaths[0] || (basename ? '/assets/img/media/' + encodeURIComponent(basename) : '');
    if (optimisticLocalPath) {
      img.setAttribute('src', optimisticLocalPath);
      img.removeAttribute('srcset');
      if (picture) {
        picture.querySelectorAll('source').forEach(function (source) {
          source.removeAttribute('srcset');
        });
      }
    }

    if (candidateLocalPaths.length > 0) {
      findFirstExistingLocalPath(candidateLocalPaths).then(function (resolvedLocalSrc) {
        if (resolvedLocalSrc) {
          applyPromotedSrc(resolvedLocalSrc);
          return;
        }

        if (!basename) return;
        checkLocalMediaExists(basename).then(function (existsBase) {
          if (!existsBase) return;
          applyPromotedSrc('/assets/img/media/' + encodeURIComponent(basename));
        });
      });
      return;
    }

    checkLocalMediaExists(basename).then(function (exists) {
      if (!exists) return;
      applyPromotedSrc('/assets/img/media/' + encodeURIComponent(basename));
    });
  }

  function restoreAvatarBlocks(root) {
    if (!root || !root.querySelectorAll) return;

    root.querySelectorAll('a[data-hook="profile-link"]').forEach(function (link) {
      var container = link.parentElement;
      var profileHref = normalizeProfileHref(link.getAttribute('href'));
      var originalAuthorName = String(link.textContent || '').replace(/\s+/g, ' ').trim();
      var authorName = normalizeAuthorName(originalAuthorName);
      var localSrc = resolveAvatarLocalUrl(window.__DEH_AVATAR_MANIFEST__, {
        profileHref: profileHref,
        authorName: authorName
      });

      if (!localSrc || !container) return;

      var avatarHost = container.querySelector('.avatar-image, .bZrSjY, .ERF5R1, wow-image');
      if (!avatarHost) return;

      var existingImg = avatarHost.querySelector('img');
      if (existingImg && existingImg.getAttribute('src') && !/^data:image\/svg\+xml/i.test(existingImg.getAttribute('src'))) {
        return;
      }

      if (avatarHost.tagName === 'WOW-IMAGE') {
        hydrateWowImage(avatarHost);
        return;
      }

      avatarHost.innerHTML = '';

      var img = document.createElement('img');
      img.setAttribute('src', localSrc);
      img.setAttribute('alt', 'Foto del escritor: ' + (originalAuthorName || '').trim());
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '50%';
      avatarHost.appendChild(img);
    });
  }

  function forceImageEagerLoad(root) {
    if (!root || !root.querySelectorAll) return;

    root.querySelectorAll('img').forEach(function (img) {
      if (!img.getAttribute('loading') || img.getAttribute('loading') === 'lazy') {
        img.setAttribute('loading', 'eager');
      }
      if (!img.getAttribute('decoding')) {
        img.setAttribute('decoding', 'async');
      }
    });
  }

  function ensureOverlayStyles() {
    if (document.getElementById('deh-local-overlay-styles')) return;

    var style = document.createElement('style');
    style.id = 'deh-local-overlay-styles';
    style.textContent = [
      '.deh-local-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(16,19,48,.62);backdrop-filter:blur(8px)}',
      '.deh-local-overlay[hidden]{display:none!important}',
      '.deh-local-overlay__dialog{width:min(1080px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#fff;border-radius:24px;box-shadow:0 28px 80px rgba(16,19,48,.28);overflow:hidden}',
      '.deh-local-overlay__header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 16px;border-bottom:1px solid rgba(16,19,48,.08)}',
      '.deh-local-overlay__eyebrow{margin:0 0 6px;color:#ef3f23;font:700 12px/1.2 Montserrat,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}',
      '.deh-local-overlay__title{margin:0;color:#101330;font:700 24px/1.15 Montserrat,Arial,sans-serif}',
      '.deh-local-overlay__subtitle{margin:8px 0 0;color:#4b5568;font:400 14px/1.5 Inter,Arial,sans-serif}',
      '.deh-local-overlay__close{flex:none;width:44px;height:44px;border:0;border-radius:999px;background:#f3f5f8;color:#101330;font:400 28px/1 sans-serif;cursor:pointer}',
      '.deh-local-overlay__body{padding:0;overflow:auto;background:#f8fafc}',
      '.deh-local-overlay__iframe{display:block;width:100%;height:min(78vh,900px);border:0;background:#fff}',
      '.deh-local-overlay__content{padding:24px}',
      '.deh-local-overlay__copy{margin:0 0 18px;color:#324158;font:400 15px/1.65 Inter,Arial,sans-serif}',
      '.deh-local-overlay__actions{display:flex;flex-wrap:wrap;gap:12px}',
      '.deh-local-overlay__action{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:999px;border:1px solid #101330;font:600 14px/1.2 Montserrat,Arial,sans-serif;text-decoration:none;transition:background-color .2s ease,color .2s ease,border-color .2s ease}',
      '.deh-local-overlay__action--primary{background:#ef3f23;border-color:#ef3f23;color:#fff}',
      '.deh-local-overlay__action--secondary{background:#fff;color:#101330}',
      '.deh-local-overlay__action:hover{background:#101330;border-color:#101330;color:#fff}',
      '@media (max-width: 767px){.deh-local-overlay{padding:12px}.deh-local-overlay__dialog{width:100%;max-height:calc(100vh - 16px);border-radius:18px}.deh-local-overlay__header{padding:18px 18px 14px}.deh-local-overlay__title{font-size:20px}.deh-local-overlay__content{padding:18px}.deh-local-overlay__iframe{height:70vh}.deh-local-overlay__actions{flex-direction:column}.deh-local-overlay__action{width:100%}}'
    ].join('');
    document.head.appendChild(style);
  }

  function getOverlayRoot() {
    var overlay = document.getElementById('deh-local-overlay');
    if (overlay) return overlay;

    ensureOverlayStyles();

    overlay = document.createElement('div');
    overlay.id = 'deh-local-overlay';
    overlay.className = 'deh-local-overlay';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<div class="deh-local-overlay__dialog" role="dialog" aria-modal="true" aria-labelledby="deh-local-overlay-title">',
      '  <div class="deh-local-overlay__header">',
      '    <div>',
      '      <p class="deh-local-overlay__eyebrow" id="deh-local-overlay-eyebrow"></p>',
      '      <h2 class="deh-local-overlay__title" id="deh-local-overlay-title"></h2>',
      '      <p class="deh-local-overlay__subtitle" id="deh-local-overlay-subtitle"></p>',
      '    </div>',
      '    <button type="button" class="deh-local-overlay__close" aria-label="Cerrar">×</button>',
      '  </div>',
      '  <div class="deh-local-overlay__body" id="deh-local-overlay-body"></div>',
      '</div>'
    ].join('');

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        closeInteractiveOverlay();
      }
    });

    overlay.querySelector('.deh-local-overlay__close').addEventListener('click', closeInteractiveOverlay);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !overlay.hidden) {
        closeInteractiveOverlay();
      }
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function closeInteractiveOverlay() {
    var overlay = document.getElementById('deh-local-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    var body = overlay.querySelector('#deh-local-overlay-body');
    if (body) body.innerHTML = '';
  }

  function renderOverlayActions(actions) {
    var list = document.createElement('div');
    list.className = 'deh-local-overlay__actions';

    (actions || []).forEach(function (action) {
      if (!action || !action.href || !action.label) return;
      var link = document.createElement('a');
      link.className = 'deh-local-overlay__action deh-local-overlay__action--' + (action.variant || 'secondary');
      link.href = action.href;
      link.textContent = action.label;
      if (action.target) link.target = action.target;
      if (action.rel) link.rel = action.rel;
      list.appendChild(link);
    });

    return list;
  }

  function openInteractiveOverlay(config) {
    if (!config) return;

    var overlay = getOverlayRoot();
    var eyebrow = overlay.querySelector('#deh-local-overlay-eyebrow');
    var title = overlay.querySelector('#deh-local-overlay-title');
    var subtitle = overlay.querySelector('#deh-local-overlay-subtitle');
    var body = overlay.querySelector('#deh-local-overlay-body');

    eyebrow.textContent = config.eyebrow || '';
    title.textContent = config.title || '';
    subtitle.textContent = config.subtitle || '';
    eyebrow.style.display = config.eyebrow ? '' : 'none';
    subtitle.style.display = config.subtitle ? '' : 'none';
    body.innerHTML = '';

    if (config.type === 'iframe' && config.src) {
      var iframe = document.createElement('iframe');
      iframe.className = 'deh-local-overlay__iframe';
      iframe.src = config.src;
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'no-referrer';
      iframe.setAttribute('title', config.title || 'Contenido');
      body.appendChild(iframe);
    } else {
      var content = document.createElement('div');
      content.className = 'deh-local-overlay__content';
      if (config.copy) {
        var copy = document.createElement('p');
        copy.className = 'deh-local-overlay__copy';
        copy.textContent = config.copy;
        content.appendChild(copy);
      }
      if (config.actions && config.actions.length) {
        content.appendChild(renderOverlayActions(config.actions));
      }
      body.appendChild(content);
    }

    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function getInteractiveConfig(trigger) {
    if (!trigger) return null;

    var popupId = String(trigger.getAttribute('data-popupid') || '').trim().toLowerCase();
    var dataHook = String(trigger.getAttribute('data-hook') || '').trim().toLowerCase();
    var ariaLabel = String(trigger.getAttribute('aria-label') || trigger.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (popupId === 'ik1hh' || ariaLabel.indexOf('formulario') >= 0) {
      return {
        eyebrow: 'Contacto',
        title: 'Formulario de contacto',
        subtitle: 'Versión local restaurada del acceso rápido.',
        type: 'iframe',
        src: '/www.dehonline.es/contacto'
      };
    }

    if (popupId === 'smykc') {
      return {
        eyebrow: 'Atención directa',
        title: 'Canales rápidos de contacto',
        subtitle: 'El acceso de WhatsApp del sitio original dependía del runtime de Wix. Lo dejo sustituido por accesos locales y directos.',
        type: 'actions',
        copy: 'Puedes abrir el formulario local completo o escribir directamente por correo al equipo comercial.',
        actions: [
          { label: 'Abrir formulario', href: '/www.dehonline.es/contacto', variant: 'primary', target: '_self' },
          { label: 'Escribir a comercial@deh.es', href: 'mailto:comercial@deh.es', variant: 'secondary', target: '_self' }
        ]
      };
    }

    if (popupId === 'nt31g') {
      return {
        eyebrow: 'Plan AF',
        title: 'CertiBox',
        subtitle: 'Detalle local restaurado desde la ruta comercial.',
        type: 'iframe',
        src: '/www.dehonline.es/certibox'
      };
    }

    if (popupId === 'nh8xj') {
      return {
        eyebrow: 'Plan AF',
        title: 'LexBox',
        subtitle: 'Detalle local restaurado desde la ruta comercial.',
        type: 'iframe',
        src: '/www.dehonline.es/lexbox'
      };
    }

    if (popupId === 'nt31m') {
      return {
        eyebrow: 'Plan AF',
        title: 'DocumBox',
        subtitle: 'Detalle local restaurado desde la ruta informativa.',
        type: 'iframe',
        src: '/www.dehonline.es/documbox-info'
      };
    }

    if (popupId === 'nt31i') {
      return {
        eyebrow: 'Plan AF',
        title: 'Control de Expedientes de Notificaciones',
        subtitle: 'Detalle local restaurado desde la ruta informativa.',
        type: 'iframe',
        src: '/www.dehonline.es/info-control-exp-notificaciones'
      };
    }

    if (popupId === 'nt31n') {
      return {
        eyebrow: 'Plan AF',
        title: 'CertiBox',
        subtitle: 'Acceso local restaurado para la ficha del servicio.',
        type: 'iframe',
        src: '/www.dehonline.es/certibox'
      };
    }

    if (popupId === 'syyvq' || popupId === 'bc8kx') {
      return {
        eyebrow: 'Plan AF',
        title: 'Solicitar informaciÃ³n',
        subtitle: 'El formulario original dependÃ­a del runtime de Wix. Lo sustituyo por el flujo local de contacto.',
        type: 'iframe',
        src: '/www.dehonline.es/contacto'
      };
    }

    if (dataHook === 'login-button' || trigger.matches('.wixui-login-social-bar [data-testid="handle-button"]')) {
      return {
        eyebrow: 'Acceso clientes',
        title: 'Inicia sesión',
        subtitle: 'Restauración local del acceso de miembros.',
        type: 'iframe',
        src: '/panel.dehonline.es/auth/login'
      };
    }

    return null;
  }

  function decorateInteractiveTriggers(root) {
    if (!root || !root.querySelectorAll) return;

    root.querySelectorAll('[data-popupid], [data-hook="login-button"], .wixui-login-social-bar [data-testid="handle-button"]').forEach(function (node) {
      if (node.dataset.dehInteractiveBound === 'done') return;
      var config = getInteractiveConfig(node);
      if (!config) return;
      node.dataset.dehInteractiveBound = 'done';
      node.setAttribute('aria-haspopup', 'dialog');
    });
  }

  function bindInteractiveTriggers() {
    if (document.documentElement.dataset.dehInteractiveDelegated === 'done') return;
    document.documentElement.dataset.dehInteractiveDelegated = 'done';

    document.addEventListener('click', function (event) {
      var trigger = event.target && event.target.closest
        ? event.target.closest('[data-popupid], [data-hook="login-button"], .wixui-login-social-bar [data-testid="handle-button"]')
        : null;
      var config = getInteractiveConfig(trigger);
      if (!config) return;

      event.preventDefault();
      event.stopPropagation();
      openInteractiveOverlay(config);
    }, true);
  }

  function processRoot(root) {
    if (!root || !root.querySelectorAll) return;
    sanitizeLocalSrcset(root);
    root.querySelectorAll('wow-image[data-image-info]').forEach(hydrateWowImage);
    root.querySelectorAll('img[src*="static.wixstatic.com/media/"], img[srcset*="static.wixstatic.com/media/"], img[src*="/images-wixmp-"], img[srcset*="/images-wixmp-"]').forEach(promoteRemoteImgToLocal);
    restoreAvatarBlocks(root);
    forceImageEagerLoad(root);
    decorateInteractiveTriggers(root);
  }

  function init() {
    loadAvatarManifest().then(function (manifest) {
      window.__DEH_AVATAR_MANIFEST__ = manifest || { byUrl: {}, byAuthorName: {}, byProfileHref: {} };
      bindInteractiveTriggers();
      processRoot(document);

      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (node.matches && node.matches('wow-image[data-image-info], img[src*="static.wixstatic.com/media/"], img[srcset*="static.wixstatic.com/media/"], img[src*="/images-wixmp-"], img[srcset*="/images-wixmp-"], a[data-hook="profile-link"]')) {
              processRoot(node.parentElement || document);
              return;
            }
            processRoot(node);
          });
        });
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
