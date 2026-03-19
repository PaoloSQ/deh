(function () {
  var blockedHosts = [
    'frog.wix.com',
    'panorama.wixapps.net',
    'sentry-next.wixpress.com',
    'sentry.wixpress.com',
    'browser.sentry-cdn.com',
    'px.ads.linkedin.com',
    'snap.licdn.com',
    'visitor-analytics.io',
    'statcounter.va-endpoint.com',
    'siteassets.parastorage.com'
  ];

  function shouldBlock(value) {
    if (!value || typeof value !== 'string') return false;
    try {
      var url = new URL(value, window.location.href);
      return blockedHosts.some(function (host) {
        return url.hostname === host;
      });
    } catch (_error) {
      return false;
    }
  }

  function noopResponse() {
    return Promise.resolve(new Response('', { status: 204, statusText: 'No Content' }));
  }

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (shouldBlock(url)) return noopResponse();
      return nativeFetch.call(this, input, init);
    };
  }

  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    var nativeOpen = window.XMLHttpRequest.prototype.open;
    var nativeSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (method, url) {
      this.__dehBlockedUrl = shouldBlock(url);
      return nativeOpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function (body) {
      if (this.__dehBlockedUrl) {
        try {
          Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
          Object.defineProperty(this, 'status', { configurable: true, value: 204 });
          Object.defineProperty(this, 'responseText', { configurable: true, value: '' });
          if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
          if (typeof this.onload === 'function') this.onload();
        } catch (_error) {
          // noop
        }
        return;
      }
      return nativeSend.call(this, body);
    };
  }

  if (navigator && typeof navigator.sendBeacon === 'function') {
    var nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (shouldBlock(url)) return true;
      return nativeBeacon(url, data);
    };
  }

  var NativeWorker = window.Worker;
  if (typeof NativeWorker === 'function') {
    window.Worker = function (url, options) {
      var nextUrl = url;
      try {
        var parsed = new URL(String(url), window.location.href);
        if (parsed.hostname === 'www.dehonline.es' && /^\/_partials\/wix-thunderbolt\/dist\//i.test(parsed.pathname)) {
          nextUrl = window.location.origin + parsed.pathname + parsed.search + parsed.hash;
        }
      } catch (_error) {
        nextUrl = url;
      }
      return new NativeWorker(nextUrl, options);
    };
    window.Worker.prototype = NativeWorker.prototype;
  }
})();
