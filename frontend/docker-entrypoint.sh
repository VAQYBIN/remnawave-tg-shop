#!/bin/sh
# Generate runtime env config from environment variables.
# This runs every time the container starts, so no rebuild needed.
cat > /usr/share/nginx/html/env-config.js << EOF
window.__ENV__ = {
  API_URL: "${API_URL:-http://localhost:8090/api}"
};
EOF
exec nginx -g "daemon off;"
