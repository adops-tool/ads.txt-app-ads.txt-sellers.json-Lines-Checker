(() => {
  function findDomainField(text, fieldName) {
    if (!text) return null;
    const regex = new RegExp(`^${fieldName}\\s*[=,:]?\\s*([^\\s#,]+)`, "im");
    const match = text.match(regex);
    return match ? match[1] : null;
  }

  const content = document.body.innerText || document.body.textContent;

  const owner = findDomainField(content, "OWNERDOMAIN");
  const manager = findDomainField(content, "MANAGERDOMAIN");

  if (!owner && !manager) return;

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(30, 30, 30, 0.8);
    color: #c9d1d9;
    padding: 15px 20px;
    border-radius: 6px;
    z-index: 2147483647;
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    border: 1px solid #30363d;
    min-width: 400px;
    backdrop-filter: blur(5px);
    line-height: 1.5;
  `;

  const title = document.createElement("div");
  title.textContent = "Domains Found:";
  title.style.cssText = "font-size: 12px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; font-weight: bold;";
  container.appendChild(title);

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

  function createRow(label, domain) {
    if (!domain) return;

    const row = document.createElement("div");
    row.style.marginBottom = "6px";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = `${label}: `;
    labelSpan.style.fontWeight = "bold";
    labelSpan.style.marginRight = "5px";
    labelSpan.style.color = "#21aeb3";

    const href = safeHref(domain);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = domain;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.cssText = "color: white; text-decoration: underline; cursor: pointer;";
      row.appendChild(labelSpan);
      row.appendChild(link);
    } else {
      row.appendChild(labelSpan);
      row.appendChild(document.createTextNode(domain));
    }

    container.appendChild(row);
  }

  createRow("OwnerDomain", owner);
  createRow("ManagerDomain", manager);

  const closeBtn = document.createElement("div");
  closeBtn.textContent = "×";
  closeBtn.style.cssText = `
    position: absolute;
    top: 5px;
    right: 8px;
    cursor: pointer;
    color: #aaa;
    font-size: 18px;
    line-height: 12px;
  `;
  closeBtn.onclick = () => container.remove();
  closeBtn.onmouseover = () => closeBtn.style.color = "#fff";
  closeBtn.onmouseout = () => closeBtn.style.color = "#aaa";
  container.appendChild(closeBtn);

  document.body.appendChild(container);
})();
