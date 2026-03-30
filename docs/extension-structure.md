# Chrome Extension Structure (MV3)

## Proposed scalable layout

```text
src/
  ui/
    popup/
      popup.html
      popup.css
      popup.js
    analyzer/
      analyzer.html
      analyzer.css
      analyzer.js
  background/
    background.js
  content/
    overlay.js
  shared/
    utils.js
  assets/
    icons/
      icon128.png
      iconlogo.png
tools/
  trigger-action/
    trigger_action.py
manifest.json
```

## Why this structure

- `src/ui/popup` and `src/ui/analyzer` isolate independent UI entrypoints.
- `src/background` keeps MV3 service-worker logic separate from UI.
- `src/content` separates injected scripts that run in page context.
- `src/shared` stores reusable helpers imported by multiple runtime contexts.
- `src/assets` centralizes static files and keeps icon paths deterministic.
- `tools/` keeps non-extension scripts outside runtime source.

## Path updates checklist after move

1. `manifest.json`
   - `action.default_popup`: `src/ui/popup/popup.html`
   - `background.service_worker`: `src/background/background.js`
   - `content_scripts[].js`: `src/content/overlay.js`
   - `icons.128`: `src/assets/icons/icon128.png`

2. `src/ui/popup/popup.html`
   - Keep local paths for same-folder assets: `popup.css`, `popup.js`
   - Update shared utility script:
     - from `utils.js`
     - to `../../shared/utils.js`
   - Update footer logo path:
     - from `icons/iconlogo.png`
     - to `../../assets/icons/iconlogo.png`

3. `src/ui/analyzer/analyzer.html`
   - If future shared imports are added, use relative paths from `src/ui/analyzer/`
   - Current local links remain `analyzer.css` and `analyzer.js`

4. `src/background/background.js`
   - `importScripts('utils.js')` must become `importScripts('../shared/utils.js')`

5. Optional validation
   - Open `chrome://extensions` -> reload unpacked extension -> verify popup render, badge updates, content script injection, and analyzer page load.

## Automation script

Use:

```bash
./scripts/restructure_sources.sh
```

It creates target folders and moves all current root-level extension source files into the new layout.
