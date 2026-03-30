(() => {
  const domainInput = document.getElementById("domain-input");
  const analyzeBtn = document.getElementById("analyze-btn");
  const statsBar = document.getElementById("stats-bar");
  const workspace = document.getElementById("workspace");
  const statusMsg = document.getElementById("status-msg");

  const adsContent = document.getElementById("ads-content");
  const appadsContent = document.getElementById("appads-content");

  const adsTotal = document.getElementById("ads-total");
  const adsDupes = document.getElementById("ads-dupes");
  const adsErrors = document.getElementById("ads-errors");
  const adsRatio = document.getElementById("ads-ratio");
  
  const appadsTotal = document.getElementById("appads-total");
  const appadsDupes = document.getElementById("appads-dupes");
  const appadsErrors = document.getElementById("appads-errors");
  const appadsRatio = document.getElementById("appads-ratio");
  
  const adsLink = document.getElementById("ads-link");
  const appadsLink = document.getElementById("appads-link");
  
  const adsRedirect = document.getElementById("ads-redirect");
  const appadsRedirect = document.getElementById("appads-redirect");

  /**
   * Normalizes a user-entered domain string for file lookups.
   *
   * @param {string} raw Raw domain input from the UI.
   * @returns {string} Normalized domain without protocol, `www`, or trailing slash.
   * @example
   * normalizeDomain("https://www.Example.com/") // "example.com"
   */
  function normalizeDomain(raw) {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.replace(/\/+$/, "");
    return d;
  }

  /**
   * Fetches a text file from the target domain and classifies common failure modes.
   *
   * @param {string} domain Target domain, already normalized.
   * @param {string} filename File to fetch (for example, `ads.txt`).
   * @returns {Promise<{text: (string|null), error: (string|null), isRedirect: boolean}>}
   * Fetch result containing file text on success, error message on failure, and redirect state.
   * @example
   * const result = await fetchFile("example.com", "ads.txt");
   * // { text: "...", error: null, isRedirect: false }
   */
  async function fetchFile(domain, filename) {
    const url = `https://${domain}/${filename}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const finalUrl = res.url || url;
      
      let isRedirect = res.redirected;
      if (finalUrl && !finalUrl.toLowerCase().split('?')[0].endsWith(filename.toLowerCase())) {
        isRedirect = true;
      }

      if (!res.ok) return { text: null, error: `HTTP ${res.status}`, isRedirect };
      
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) return { text: null, error: "Returned HTML (likely 404)", isRedirect };
      
      let text = await res.text();
      text = text.replace(/\r\n|\r/g, "\n");
      const trimmed = text.trim();
      
      if (
        trimmed.startsWith("<!DOCTYPE") ||
        trimmed.startsWith("<html") ||
        trimmed.startsWith("<head") ||
        trimmed.substring(0, 300).toLowerCase().includes("<script")
      ) {
        return { text: null, error: "Soft 404 (HTML content)", isRedirect };
      }
      return { text, error: null, isRedirect };
    } catch (e) {
      return { text: null, error: e.message || "Network error", isRedirect: false };
    }
  }

  /**
   * Parses a single ads-like line into a typed analysis object.
   *
   * @param {string} raw Raw input line from the source file.
   * @returns {{
   *   type: "empty"|"variable"|"error"|"comment"|"data",
   *   raw: string,
   *   trimmed: string,
   *   reason?: string,
   *   domain?: string,
   *   pubId?: string,
   *   relationship?: string,
   *   key?: string
   * }} Parsed line metadata used by the analyzer and renderer.
   * @example
   * parseLine("example.com, pub-123, DIRECT");
   * // { type: "data", domain: "example.com", pubId: "pub-123", ... }
   */
  function parseLine(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return { type: "empty", raw, trimmed };

    const upper = trimmed.toUpperCase();
    if (
      upper.startsWith("OWNERDOMAIN") ||
      upper.startsWith("MANAGERDOMAIN") ||
      upper.startsWith("CONTACT") ||
      upper.startsWith("SUBDOMAIN")
    ) {
      return { type: "variable", raw, trimmed };
    }

    const startsSpecial = /^[^a-zA-Z0-9]/.test(trimmed);
    const hasComma = trimmed.includes(",");

    if (startsSpecial && hasComma) {
      return { type: "error", raw, trimmed, reason: "Data line is commented out" };
    }
    
    if (trimmed.startsWith("#") || startsSpecial) {
      return { type: "comment", raw, trimmed };
    }

    const parts = trimmed.split(",").map((p) => p.trim());
    if (parts.length < 3) return { type: "error", raw, trimmed, reason: "Too few fields" };

    const domain = parts[0].toLowerCase();
    const pubId = parts[1];
    const relationship = parts[2].toUpperCase();

    if (!domain || !pubId) return { type: "error", raw, trimmed, reason: "Missing domain or publisher ID" };
    if (relationship !== "DIRECT" && relationship !== "RESELLER") {
      return { type: "error", raw, trimmed, reason: `Invalid relationship: ${parts[2]}` };
    }

    return {
      type: "data",
      raw,
      trimmed,
      domain,
      pubId,
      relationship,
      key: `${domain}|${pubId}`.toLowerCase()
    };
  }

  /**
   * Analyzes full file text and computes duplicate, error, and relationship stats.
   *
   * @param {(string|null)} text File text content. `null` means unavailable.
   * @returns {{
   *   lines: Array<object>,
   *   totalData: number,
   *   duplicates: Set<number>,
   *   errors: number,
   *   direct: number,
   *   reseller: number,
   *   keySet: Set<string>
   * }} Aggregate analysis used by stats and side-by-side rendering.
   * @example
   * const stats = analyzeFile("a.com, pub-1, DIRECT\\na.com, pub-1, DIRECT");
   * // stats.duplicates.size === 2
   */
  function analyzeFile(text) {
    if (!text) return { lines: [], totalData: 0, duplicates: new Set(), errors: 0, direct: 0, reseller: 0, keySet: new Set() };

    const rawLines = text.split("\n");
    const lines = rawLines.map(parseLine);
    const seen = {};
    const duplicates = new Set();
    let errors = 0;
    let direct = 0;
    let reseller = 0;
    const keySet = new Set();

    lines.forEach((line, idx) => {
      if (line.type === "error") {
        errors++;
      } else if (line.type === "data") {
        if (seen[line.key] !== undefined) {
          duplicates.add(seen[line.key]);
          duplicates.add(idx);
        } else {
          seen[line.key] = idx;
        }
        keySet.add(line.key);
        if (line.relationship === "DIRECT") direct++;
        else reseller++;
      }
    });

    const totalData = lines.filter((l) => l.type === "data").length;
    return { lines, totalData, duplicates, errors, direct, reseller, keySet };
  }

  /**
   * Renders analyzed lines into a column and applies semantic highlight classes.
   *
   * @param {HTMLElement} container Target column container.
   * @param {{lines: Array<object>, duplicates: Set<number>}} analysis Analysis for the current file.
   * @param {Set<string>} otherKeySet Data keys from the opposite file for discrepancy checks.
   * @returns {void} Does not return a value.
   * @example
   * renderColumn(adsContent, adsAnalysis, appadsAnalysis.keySet);
   */
  function renderColumn(container, analysis, otherKeySet) {
    container.innerHTML = "";
    const { lines, duplicates } = analysis;

    lines.forEach((line, idx) => {
      const el = document.createElement("span");
      el.className = "line";

      if (line.type === "error") {
        el.classList.add("line-error");
        el.title = line.reason;
      } else if (line.type === "data" && duplicates.has(idx)) {
        el.classList.add("line-duplicate");
        el.title = "Duplicate line";
      } else if (line.type === "data" && !otherKeySet.has(line.key)) {
        el.classList.add("line-discrepancy");
        el.title = "Not found in the other file";
      }

      el.textContent = line.raw;
      container.appendChild(el);
    });
  }

  /**
   * Updates the stats bar values for one side (`ads` or `appads`).
   *
   * @param {string} prefix DOM id prefix used to resolve stat elements.
   * @param {{
   *   totalData: number,
   *   duplicates: Set<number>,
   *   errors: number,
   *   direct: number,
   *   reseller: number
   * }} analysis Computed metrics for the selected file.
   * @returns {void} Does not return a value.
   * @example
   * updateStats("ads", adsAnalysis);
   */
  function updateStats(prefix, analysis) {
    const totalEl = document.getElementById(`${prefix}-total`);
    const dupesEl = document.getElementById(`${prefix}-dupes`);
    const errorsEl = document.getElementById(`${prefix}-errors`);
    const ratioEl = document.getElementById(`${prefix}-ratio`);

    totalEl.textContent = `Lines: ${analysis.totalData}`;
    dupesEl.textContent = `Duplicates: ${analysis.duplicates.size}`;
    if (errorsEl) errorsEl.textContent = `Error: ${analysis.errors}`;
    ratioEl.textContent = `DIRECT / RESELLER: ${analysis.direct} / ${analysis.reseller}`;
  }

  /**
   * Runs the end-to-end analysis flow for `ads.txt` and `app-ads.txt`.
   *
   * @param {string} domain Raw domain entered by the user.
   * @returns {Promise<void>} Resolves after UI updates complete.
   * @example
   * await runAnalysis("example.com");
   */
  async function runAnalysis(domain) {
    domain = normalizeDomain(domain);
    if (!domain) {
      statusMsg.textContent = "Please enter a valid domain.";
      return;
    }

    statusMsg.style.display = "flex";
    statusMsg.textContent = `Fetching files from ${domain}...`;
    if (adsLink) adsLink.href = `https://${domain}/ads.txt`;
    if (appadsLink) appadsLink.href = `https://${domain}/app-ads.txt`;
    
    adsRedirect.style.display = "none";
    appadsRedirect.style.display = "none";
    
    statsBar.style.display = "none";
    workspace.style.display = "none";

    analyzeBtn.disabled = true;

    const [adsResult, appadsResult] = await Promise.all([
      fetchFile(domain, "ads.txt"),
      fetchFile(domain, "app-ads.txt")
    ]);

    analyzeBtn.disabled = false;

    if (!adsResult.text && !appadsResult.text) {
      statusMsg.textContent = `Could not fetch files from ${domain}. ads.txt: ${adsResult.error}. app-ads.txt: ${appadsResult.error}.`;
      return;
    }

    if (adsResult.isRedirect) {
      adsRedirect.style.display = "inline-block";
    }
    if (appadsResult.isRedirect) {
      appadsRedirect.style.display = "inline-block";
    }

    const adsAnalysis = analyzeFile(adsResult.text);
    const appadsAnalysis = analyzeFile(appadsResult.text);

    statusMsg.style.display = "none";
    statsBar.style.display = "flex";
    workspace.style.display = "flex";

    updateStats("ads", adsAnalysis);
    updateStats("appads", appadsAnalysis);

    if (adsResult.text) {
      renderColumn(adsContent, adsAnalysis, appadsAnalysis.keySet);
    } else {
      adsContent.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "line line-error";
      msg.textContent = `Error: ${adsResult.error}`;
      adsContent.appendChild(msg);
    }

    if (appadsResult.text) {
      renderColumn(appadsContent, appadsAnalysis, adsAnalysis.keySet);
    } else {
      appadsContent.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "line line-error";
      msg.textContent = `Error: ${appadsResult.error}`;
      appadsContent.appendChild(msg);
    }
  }

  /* Event listeners */
  const initialDomain = normalizeDomain(new URLSearchParams(window.location.search).get("domain") || "");
  if (initialDomain) {
    domainInput.value = initialDomain;
  }

  analyzeBtn.addEventListener("click", () => {
    runAnalysis(domainInput.value);
  });

  domainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runAnalysis(domainInput.value);
  });

})();
