#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/ui/popup src/ui/analyzer src/background src/content src/shared src/assets/icons tools/trigger-action

mv popup.html src/ui/popup/popup.html
mv popup.js src/ui/popup/popup.js
mv popup.css src/ui/popup/popup.css

mv analyzer.html src/ui/analyzer/analyzer.html
mv analyzer.js src/ui/analyzer/analyzer.js
mv analyzer.css src/ui/analyzer/analyzer.css

mv background.js src/background/background.js
mv overlay.js src/content/overlay.js
mv utils.js src/shared/utils.js

mv icons/* src/assets/icons/
rmdir icons

mv 'trigger action/trigger_action.py' tools/trigger-action/trigger_action.py
rmdir 'trigger action'

echo "Migration complete. Update manifest and relative paths in HTML/JS imports."
