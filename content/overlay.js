(() => {
  const rawText = document.body.textContent || document.body.innerText || "";

  function findDomainField(text, fieldName) {
    if (!text) return null;
    const lines = text.split(/\r\n|\r|\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/^[\s#]+/, "");
      const regex = new RegExp(`^${fieldName}\\s*[=,:]?\\s*([^\\s#,]+)`, "i");
      const match = line.match(regex);
      if (match) return match[1];
    }
    return null;
  }

  const owner = findDomainField(rawText, "OWNERDOMAIN");
  const manager = findDomainField(rawText, "MANAGERDOMAIN");
  const contact = findDomainField(rawText, "CONTACT");
  const contactEmail = findDomainField(rawText, "CONTACT-EMAIL");

  const isAdsTxt = /,\s*(DIRECT|RESELLER)/i.test(rawText) || 
                   /OWNERDOMAIN\s*=/i.test(rawText) || 
                   /MANAGERDOMAIN\s*=/i.test(rawText);

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --bg-color: #ffffff;
      --text-color: #24292f;
      --comment-color: #6e7781;
      --key-color: #0550ae;
      --value-color: #0a3069;
      --domain-color: #008b8b;
      --pubid-color: #9a6700;
      --direct-color: #1a7f37;
      --reseller-color: #d1242f;
      --overlay-bg: rgba(255, 255, 255, 0.95);
      --overlay-border: #d0d7de;
      --overlay-text: #24292f;
      --overlay-title: #57606a;
      --overlay-close: #6e7781;
      --overlay-close-hover: #24292f;
      --overlay-label: #21aeb3;
      --btn-bg: transparent;
      --btn-text: #24292f;
      --btn-border: #6e7781;
      --btn-hover-bg: #21aeb3;
      --btn-hover-text: #ffffff;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --comment-color: #8896a6;
        --key-color: #d2a8ff;
        --value-color: #79c0ff;
        --domain-color: #21aeb3;
        --pubid-color: #e8a007;
        --direct-color: #10bc89;
        --reseller-color: #e03131;
        --overlay-bg: rgba(30, 30, 30, 0.85);
        --overlay-border: #30363d;
        --overlay-text: #c9d1d9;
        --overlay-title: #aaa;
        --overlay-close: #aaa;
        --overlay-close-hover: #fff;
        --overlay-label: #21aeb3;
        --btn-bg: transparent;
        --btn-text: #ffffff;
        --btn-border: #8896a6;
        --btn-hover-bg: #21aeb3;
        --btn-hover-text: #000000;
      }
    }

    body.adwmg-custom-viewer {
      background-color: var(--bg-color);
      color: var(--text-color);
      margin: 0;
      padding-top: 30px;
    }

    .adwmg-token-comment { color: var(--comment-color); }
    .adwmg-token-key { color: var(--key-color); }
    .adwmg-token-value { color: var(--value-color); }
    .adwmg-token-domain { color: var(--domain-color); text-decoration: none; }
    .adwmg-token-pubid { color: var(--pubid-color); }
    .adwmg-token-direct { color: var(--direct-color); }
    .adwmg-token-reseller { color: var(--reseller-color); }

    .adwmg-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--overlay-bg);
      color: var(--overlay-text);
      padding: 15px 20px;
      border-radius: 6px;
      z-index: 2147483647;
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      border: 1px solid var(--overlay-border);
      min-width: 400px;
      backdrop-filter: blur(5px);
      line-height: 1.5;
    }

    .adwmg-overlay-title {
      font-size: 12px;
      color: var(--overlay-title);
      margin-bottom: 8px;
      text-transform: uppercase;
      font-weight: bold;
    }

    .adwmg-overlay-row { margin-bottom: 6px; }
    .adwmg-overlay-label { font-weight: bold; margin-right: 5px; color: var(--overlay-label); }
    .adwmg-overlay-link { color: var(--overlay-text); text-decoration: none; cursor: pointer; }
    .adwmg-overlay-divider { border-top: 1px solid var(--overlay-border); margin: 10px 0 15px 0; }

    .adwmg-close-btn {
      position: absolute;
      top: 5px;
      right: 8px;
      cursor: pointer;
      color: var(--overlay-close);
      font-size: 18px;
      line-height: 12px;
    }
    .adwmg-close-btn:hover { color: var(--overlay-close-hover); }

    .adwmg-btn-container {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
    }

    .adwmg-analyze-btn {
      background: var(--btn-bg);
      color: var(--btn-text);
      border: 1px solid var(--btn-border);
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      transition: background 0.2s, color 0.2s;
      outline: none;
    }
    .adwmg-analyze-btn:hover {
      background: var(--btn-hover-bg);
      color: var(--btn-hover-text);
      border-color: var(--btn-hover-bg);
    }

    .adwmg-code-block {
      word-wrap: break-word;
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 13px;
      padding: 8px;
      margin: 0;
    }
  `;
  document.head.appendChild(style);

  let container = null;

  if (owner || manager || contact || contactEmail) {
    container = document.createElement("div");
    container.className = "adwmg-overlay";

    const hasDomains = owner || manager;
    const hasContact = contact || contactEmail;

    if (hasDomains) {
      const title = document.createElement("div");
      title.textContent = "Domains Found:";
      title.className = "adwmg-overlay-title";
      container.appendChild(title);
    }

    function safeHref(value) {
      if (!value) return null;
      let href = value.trim();
      if (!href.startsWith("http://") && !href.startsWith("https://")) {
        href = "https://" + href;
      }
      try {
        const url = new URL(href);
        if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
        return null;
      } catch {
        return null;
      }
    }

    function createRow(label, value, isLink) {
      if (!value) return;

      const row = document.createElement("div");
      row.className = "adwmg-overlay-row";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = `${label}: `;
      labelSpan.className = "adwmg-overlay-label";

      if (isLink !== false) {
        const href = safeHref(value);
        if (href) {
          const link = document.createElement("a");
          link.href = href;
          link.textContent = value;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "adwmg-overlay-link";
          row.appendChild(labelSpan);
          row.appendChild(link);
        } else {
          row.appendChild(labelSpan);
          row.appendChild(document.createTextNode(value));
        }
      } else {
        row.appendChild(labelSpan);
        row.appendChild(document.createTextNode(value));
      }

      container.appendChild(row);
    }

    createRow("OwnerDomain", owner);
    createRow("ManagerDomain", manager);

    if (hasDomains && hasContact) {
      const divider = document.createElement("div");
      divider.className = "adwmg-overlay-divider";
      container.appendChild(divider);
    }

    if (hasContact) {
      const contactTitle = document.createElement("div");
      contactTitle.textContent = "Contact Info:";
      contactTitle.className = "adwmg-overlay-title";
      container.appendChild(contactTitle);
    }

    createRow("Contact", contact);
    createRow("Contact-email", contactEmail, false);

    const closeBtn = document.createElement("div");
    closeBtn.textContent = "×";
    closeBtn.className = "adwmg-close-btn";
    closeBtn.onclick = () => container.remove();
    container.appendChild(closeBtn);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function applySyntaxHighlighting() {
    if (!isAdsTxt) return;

    const lines = rawText.split(/\r?\n/);
    const highlightedLines = lines.map(line => {
      let cleanLine = line.replace(/\r$/, '');
      
      if (cleanLine.trim().startsWith("#")) {
        return `<span class="adwmg-token-comment">${escapeHtml(cleanLine)}</span>`;
      }

      let commentPart = "";
      let dataPart = cleanLine;
      const hashIdx = cleanLine.indexOf("#");
      
      if (hashIdx !== -1) {
        dataPart = cleanLine.substring(0, hashIdx);
        commentPart = cleanLine.substring(hashIdx);
      }

      let resultHtml = "";
      const varMatch = dataPart.match(/^(\s*[A-Za-z0-9-]+\s*)([=:])(.*)$/);
      const upperKey = varMatch ? varMatch[1].trim().toUpperCase() : "";

      if (varMatch && ["OWNERDOMAIN", "MANAGERDOMAIN", "CONTACT", "SUBDOMAIN", "CONTACT-EMAIL"].includes(upperKey)) {
        resultHtml = `<span class="adwmg-token-key">${escapeHtml(varMatch[1])}</span>` +
                     escapeHtml(varMatch[2]) +
                     `<span class="adwmg-token-value">${escapeHtml(varMatch[3])}</span>`;
      } 
      else if (dataPart.includes(",")) {
        const parts = dataPart.split(",");
        for (let i = 0; i < parts.length; i++) {
          let partText = escapeHtml(parts[i]);
          let coloredPart = partText;
          let trimmed = parts[i].trim();

          if (i === 0) {
            if (trimmed) {
              let href = trimmed;
              if (!href.startsWith("http://") && !href.startsWith("https://")) {
                href = "https://" + href;
              }
              coloredPart = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="adwmg-token-domain">${partText}</a>`;
            } else {
              coloredPart = `<span class="adwmg-token-domain">${partText}</span>`;
            }
          } else if (i === 1) {
            coloredPart = `<span class="adwmg-token-pubid">${partText}</span>`;
          } else if (i === 2) {
            const upType = trimmed.toUpperCase();
            if (upType === "DIRECT") {
              coloredPart = `<span class="adwmg-token-direct">${partText}</span>`;
            } else if (upType === "RESELLER") {
              coloredPart = `<span class="adwmg-token-reseller">${partText}</span>`;
            }
          } else if (i === 3) {
            coloredPart = `<span class="adwmg-token-comment">${partText}</span>`;
          }

          resultHtml += coloredPart;
          if (i < parts.length - 1) resultHtml += ",";
        }
      } else {
        resultHtml = escapeHtml(dataPart);
      }

      if (commentPart) {
        resultHtml += `<span class="adwmg-token-comment">${escapeHtml(commentPart)}</span>`;
      }

      return resultHtml;
    });

    document.body.innerHTML = "";
    document.body.className = "adwmg-custom-viewer";
    
    const newPre = document.createElement("pre");
    newPre.className = "adwmg-code-block";
    newPre.innerHTML = highlightedLines.join("\n");

    document.body.appendChild(newPre);

    if (container) {
      document.body.appendChild(container);
    }

    const leftContainer = document.createElement("div");
    leftContainer.className = "adwmg-btn-container";

    const analyzeBtn = document.createElement("button");
    analyzeBtn.textContent = "Analyzer .txt file";
    analyzeBtn.className = "adwmg-analyze-btn";
    
    analyzeBtn.onclick = () => {
      const currentDomain = window.location.hostname;
      chrome.runtime.sendMessage({ type: "openAnalyzer", domain: currentDomain });
    };

    leftContainer.appendChild(analyzeBtn);
    document.body.appendChild(leftContainer);
  }

  applySyntaxHighlighting();

})();