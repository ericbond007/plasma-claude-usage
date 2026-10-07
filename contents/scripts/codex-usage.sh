#!/usr/bin/env bash

set -u

if ! command -v codex >/dev/null 2>&1; then
    printf '{"error":"Codex CLI not installed"}\n'
    exit 0
fi

coproc CODEX_USAGE_SERVER { codex app-server --stdio 2>/dev/null; }
server_pid=$CODEX_USAGE_SERVER_PID

cleanup() {
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

printf '%s\n' \
    '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"plasma-claude-usage","title":"Plasma AI Usage","version":"1.4.0"}}}' \
    '{"id":2,"method":"account/rateLimits/read"}' \
    >&"${CODEX_USAGE_SERVER[1]}"

while IFS= read -r -t 20 line <&"${CODEX_USAGE_SERVER[0]}"; do
    if [[ "$line" == *'"id":2'* ]]; then
        printf '%s\n' "$line"
        exit 0
    fi
done

printf '{"error":"Codex usage request failed"}\n'
