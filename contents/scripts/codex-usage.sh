#!/usr/bin/env bash
# Codex rate limits for the widget (fork addition): asks the local Codex CLI over
# its app-server JSON-RPC protocol and prints the account/rateLimits/read response
# line (or {"error": ...}). Bounded in time: codex is killed after 30 s even if
# this script is SIGKILLed, and the script itself gives up after 20 s, so a hung
# server can never pin the widget's executable source.

set -u

if ! command -v codex >/dev/null 2>&1; then
    printf '{"error":"Codex CLI not installed"}\n'
    exit 0
fi

coproc CODEX_USAGE_SERVER { exec timeout -k 5 30 codex app-server --stdio 2>/dev/null; }
server_pid=$CODEX_USAGE_SERVER_PID

cleanup() {
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

printf '%s\n' \
    '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"plasma-claude-usage","title":"Plasma AI Usage","version":"2.4.1.1"}}}' \
    '{"method":"initialized"}' \
    '{"id":2,"method":"account/rateLimits/read"}' \
    >&"${CODEX_USAGE_SERVER[1]}"

deadline=$((SECONDS + 20))
while (( SECONDS < deadline )) && IFS= read -r -t $((deadline - SECONDS)) line <&"${CODEX_USAGE_SERVER[0]}"; do
    if [[ "$line" =~ \"id\":[[:space:]]*2[,}] ]]; then
        printf '%s\n' "$line"
        exit 0
    fi
done

printf '{"error":"Codex usage request failed"}\n'
