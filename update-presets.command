#!/bin/bash

# update-presets.command
# Double-click this file to regenerate /presets/index.json from all .frakt files in /presets/

# Change to the directory where this script lives
cd "$(dirname "$0")"

PRESETS_DIR="./presets"
INDEX_FILE="$PRESETS_DIR/index.json"

echo "Scanning $PRESETS_DIR for .frakt files..."

# Start JSON
echo '{' > "$INDEX_FILE"
echo '  "presets": [' >> "$INDEX_FILE"

first=true
for filepath in "$PRESETS_DIR"/*.frakt; do
  [ -f "$filepath" ] || continue
  filename=$(basename "$filepath")
  id="${filename%.frakt}"
  # Extract name from the .frakt JSON if possible, fall back to id
  name=$(python3 -c "
import json, sys
try:
    with open('$filepath') as f:
        d = json.load(f)
    print(d.get('name', '$id'))
except:
    print('$id')
" 2>/dev/null || echo "$id")

  if [ "$first" = true ]; then
    first=false
  else
    echo ',' >> "$INDEX_FILE"
  fi

  printf '    { "id": "%s", "file": "%s", "name": "%s" }' "$id" "$filename" "$name" >> "$INDEX_FILE"
done

echo '' >> "$INDEX_FILE"
echo '  ]' >> "$INDEX_FILE"
echo '}' >> "$INDEX_FILE"

echo "Done. index.json updated with:"
cat "$INDEX_FILE"
echo ""
echo "Press any key to close..."
read -n 1
