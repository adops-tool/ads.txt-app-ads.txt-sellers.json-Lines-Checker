importScripts('../shared/utils.js');

const CACHE_KEY = "adwmg_sellers_cache";
const CACHE_TS_KEY = "adwmg_sellers_ts";
const BADGE_BG_COLOR = "#21aeb3";
const SCAN_COOLDOWN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const FETCH_RETRIES = 3;
const FIXED_CACHE_TTL_MS = 1 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 5000;
const RETRY_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

const countsByTab = Object.create(null);
const lastScanAt = Object.create(null);
const scheduledTimers = Object.create(null);
const retryAttempts = Object.create(null);

/**
 * Fetches sellers.json and stores a normalized sellers cache in local storage.
 *
 * @returns {Promise<(Array<Object>|null)>} Cached sellers array on success, otherwise null.
 *
 * @example
 * const sellers = await fetchAndCacheSellers();
 * if (sellers) console.log(sellers.length);
 */
async function fetchAndCacheSellers() {
  // Step 1: Resolve effective sellers source (custom override or default).
  const config = await new Promise(r => chrome.storage.local.get([CUSTOM_URL_KEY], (res) => {
    if (chrome.runtime.lastError) return r({});
    r(res || {});
  }));
  const urlToFetch = config[CUSTOM_URL_KEY] || DEFAULT_SELLERS_URL;
  try {
    // Step 2: Fetch and coerce to predictable array shape for UI consumers.
    const res = await fetchWithTimeoutAndRetry(urlToFetch, { timeout: FETCH_TIMEOUT_MS, retries: FETCH_RETRIES });
    const data = await res.json();
    const sellers = Array.isArray(data.sellers) ? data.sellers : [];
    const items = {};
    items[CACHE_KEY] = sellers;
    items[CACHE_TS_KEY] = Date.now();
    await new Promise((resolve) => chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) return resolve();
      resolve();
    }));
    return sellers;
  } catch (err) {
    // Swallow fetch errors so extension flow remains non-blocking.
    return null;
  }
}

/**
 * Reads sellers cache and timestamp from extension local storage.
 *
 * @returns {Promise<{sellers: Array<Object>, ts: number}>} Cache payload with safe defaults.
 *
 * @example
 * const cache = await getCachedSellers();
 * console.log(cache.ts);
 */
function getCachedSellers() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY, CACHE_TS_KEY], (res) => {
      if (chrome.runtime.lastError) return resolve({ sellers: [], ts: 0 });
      resolve({
        sellers: Array.isArray(res[CACHE_KEY]) ? res[CACHE_KEY] : [],
        ts: res[CACHE_TS_KEY] || 0
      });
    });
  });
}

/**
 * Applies badge text and color for a specific tab.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {void}
 *
 * @example
 * applyBadgeForTab(123);
 */
function applyBadgeForTab(tabId) {
  const count = countsByTab[tabId] || 0;
  const text = count > 0 ? String(count) : "";
  // Empty text intentionally clears badge when there are no matches.
  chrome.action.setBadgeText({ text }, () => {
    if (chrome.runtime.lastError) return;
  });
  if (text) {
    chrome.action.setBadgeBackgroundColor({ color: BADGE_BG_COLOR }, () => {
      if (chrome.runtime.lastError) return;
    });
  }
}

/**
 * Cancels any scheduled scan timer for a tab and clears retry state.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {void}
 *
 * @example
 * cancelScheduled(123);
 */
function cancelScheduled(tabId) {
  const t = scheduledTimers[tabId];
  if (t) {
    clearTimeout(t);
    delete scheduledTimers[tabId];
    delete retryAttempts[tabId];
  }
}

/**
 * Removes all in-memory scan state for a tab.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {void}
 *
 * @example
 * cleanupTab(123);
 */
function cleanupTab(tabId) {
  cancelScheduled(tabId);
  delete countsByTab[tabId];
  delete lastScanAt[tabId];
}

/**
 * Computes the current sellers brand token from configured sellers URL.
 *
 * @returns {Promise<string>} Brand token used in line matching.
 *
 * @example
 * const brand = await getSellersDomain();
 */
async function getSellersDomain() {
  const config = await new Promise(r => chrome.storage.local.get([CUSTOM_URL_KEY], (res) => {
    if (chrome.runtime.lastError) return r({});
    r(res || {});
  }));
  const url = config[CUSTOM_URL_KEY] || DEFAULT_SELLERS_URL;
  return getBrandName(url);
}

/**
 * Counts brand-related lines from ads.txt and app-ads.txt for a tab origin.
 *
 * @param {number} tabId - Browser tab where the scan script is executed.
 * @param {string} origin - Origin URL (`scheme://host[:port]`) used for fetch targets.
 * @returns {Promise<{ok: boolean, count: number}>} Scan status and total matched line count.
 *
 * @example
 * const result = await executeCountadwmgLines(123, "https://example.com");
 * console.log(result.count);
 */
async function executeCountadwmgLines(tabId, origin) {
  const domain = await getSellersDomain();
  try {
    // Step 1: Run fetch logic in isolated page context to preserve origin access.
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (originUrl, timeoutMs, filterDomain) => {
        /**
         * Fetches a text resource with timeout in isolated page context.
         *
         * @param {string} url - Resource URL to fetch.
         * @param {number} timeout - Timeout in milliseconds before aborting.
         * @returns {Promise<(string|null)>} Response text or null on any failure.
         *
         * @example
         * const txt = await fetchWithTimeout("https://example.com/ads.txt", 5000);
         */
        function fetchWithTimeout(url, timeout) {
          return new Promise((resolve) => {
            const controller = new AbortController();
            const id = setTimeout(() => { controller.abort(); resolve(null); }, timeout);
            fetch(url, { signal: controller.signal, credentials: "same-origin" })
              .then(r => {
                clearTimeout(id);
                if (!r.ok) return resolve(null);
                r.text().then(t => resolve(t)).catch(() => resolve(null));
              })
              .catch(() => { clearTimeout(id); resolve(null); });
          });
        }
        /**
         * Counts lines containing a brand token in ads-style text files.
         *
         * @param {(string|null)} text - Input file text, if available.
         * @param {string} brand - Brand token to match case-insensitively.
         * @returns {number} Number of matched lines.
         *
         * @example
         * const count = countadwmgLines("a\\nadwmg,b", "adwmg");
         */
        function countadwmgLines(text, brand) {
          if (!text) return 0;
          // Normalize line endings to keep counts stable across platforms.
          return text.replace(/\r\n|\r/g, "\n").split("\n").filter(l => l.toLowerCase().includes(brand.toLowerCase())).length;
        }
        return (async () => {
          const baseUrl = originUrl.replace(/\/$/, "");
          // Fetch both endpoints concurrently to reduce popup latency.
          const [adsText, appAdsTextLocal] = await Promise.all([
            fetchWithTimeout(baseUrl + "/ads.txt", timeoutMs),
            fetchWithTimeout(baseUrl + "/app-ads.txt", timeoutMs)
          ]);
          return {
            ok: true,
            adsCount: countadwmgLines(adsText, filterDomain),
            appAdsLocalFailed: appAdsTextLocal === null,
            appAdsCountLocal: countadwmgLines(appAdsTextLocal, filterDomain)
          };
        })();
      },
      args: [origin, FETCH_TIMEOUT_MS, domain],
      world: "ISOLATED"
    });

    if (!Array.isArray(results) || results.length === 0 || !results[0].result) return { ok: false, count: 0 };
    const res0 = results[0].result;
    let totalCount = res0.adsCount + res0.appAdsCountLocal;

    // Fallback: background fetch can recover when page-context fetch is blocked.
    if (res0.appAdsLocalFailed) {
      const appAdsUrl = origin.replace(/\/$/, "") + "/app-ads.txt";
      try {
        const res = await fetchWithTimeoutAndRetry(appAdsUrl, { timeout: FETCH_TIMEOUT_MS, retries: 0 });
        const text = await res.text();
        totalCount += text.split("\n").filter(l => l.toLowerCase().includes(domain.toLowerCase())).length;
      } catch (e) {}
    }
    return { ok: true, count: totalCount };
  } catch (err) {
    // Return safe defaults to avoid crashing tab event handlers.
    return { ok: false, count: 0 };
  }
}

/**
 * Executes a guarded scan for a tab and updates in-memory match count.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {Promise<(number|null)>} Matched line count, or null when scan is skipped.
 *
 * @example
 * const matches = await processScan(123);
 */
async function processScan(tabId) {
  // Cooldown avoids noisy rescans during rapid tab lifecycle events.
  if (Date.now() - (lastScanAt[tabId] || 0) < SCAN_COOLDOWN_MS) return null;
  lastScanAt[tabId] = Date.now();
  const tab = await new Promise((resolve) => chrome.tabs.get(tabId, (t) => {
    if (chrome.runtime.lastError) return resolve(null);
    resolve(t);
  }));
  // Skip unsupported URLs because extension APIs cannot reliably inject there.
  if (!tab || !tab.url || !/^https?:\/\//i.test(tab.url)) return null;
  const origin = new URL(tab.url).origin;
  const scanRes = await executeCountadwmgLines(tabId, origin);
  countsByTab[tabId] = scanRes.count;
  return scanRes.count;
}

/**
 * Retries scanning a tab until matches are found or retry budget is exhausted.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {Promise<void>}
 *
 * @example
 * await retryScanForTab(123);
 */
async function retryScanForTab(tabId) {
  cancelScheduled(tabId);
  const currentAttempts = (retryAttempts[tabId] || 0) + 1;
  retryAttempts[tabId] = currentAttempts;
  const matches = await processScan(tabId);
  // Only update badge for active tab to avoid visual churn in inactive tabs.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    if (tabs && tabs[0] && tabs[0].id === tabId) applyBadgeForTab(tabId);
  });
  if (matches > 0 || currentAttempts >= MAX_RETRIES) {
    delete retryAttempts[tabId];
    return;
  }
  scheduledTimers[tabId] = setTimeout(() => retryScanForTab(tabId), RETRY_INTERVAL_MS);
}

/**
 * Schedules an initial delayed scan for a tab.
 *
 * @param {number} tabId - Target browser tab ID.
 * @returns {void}
 *
 * @example
 * scheduleScan(123);
 */
function scheduleScan(tabId) {
  // Reset cooldown so first scheduled attempt is never skipped.
  cancelScheduled(tabId);
  delete lastScanAt[tabId];
  scheduledTimers[tabId] = setTimeout(() => retryScanForTab(tabId), INITIAL_DELAY_MS);
}

// Tab lifecycle listeners keep telemetry synchronized with current browsing state.
chrome.tabs.onActivated.addListener((info) => { applyBadgeForTab(info.tabId); scheduleScan(info.tabId); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Navigation or loading transition invalidates prior counts for that tab.
  if (changeInfo.url || changeInfo.status === "loading") {
    delete countsByTab[tabId];
    cancelScheduled(tabId);
    scheduleScan(tabId);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => { cleanupTab(tabId); });

/**
 * Handles cross-context messages for cache, refresh, and badge operations.
 *
 * @param {{type: string, count?: number}} message - Message payload from extension contexts.
 * @param {chrome.runtime.MessageSender} sender - Chrome sender metadata.
 * @param {function(Object): void} sendResponse - Callback used to return async responses.
 * @returns {boolean} Always true to keep the message channel open for async work.
 *
 * @example
 * chrome.runtime.sendMessage({ type: "refreshSellers" });
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "getSellersCache") {
      const cached = await getCachedSellers();
      // Background refresh keeps popup responsive while renewing stale cache.
      if (!cached.ts || (Date.now() - cached.ts) > FIXED_CACHE_TTL_MS) fetchAndCacheSellers();
      sendResponse({ sellers: cached.sellers, ts: cached.ts });
    } else if (message.type === "refreshSellers") {
      const sellers = await fetchAndCacheSellers();
      sendResponse({ ok: !!sellers, sellers });
    } else if (message.type === "setBadge") {
      const count = Math.max(0, message.count || 0);
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" }, () => {
        if (chrome.runtime.lastError) return;
      });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_BG_COLOR }, () => {
        if (chrome.runtime.lastError) return;
      });
      sendResponse({ ok: true });
    }
  })();
  return true;
});
