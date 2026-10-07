# Claude Usage Widget - Development Guide

## Project Overview

This is a KDE Plasma 6 widget that displays Claude Code usage statistics (session and weekly limits) in the taskbar.

## Architecture

The widget is **pure QML** with no external dependencies:

1. **Credentials reading**: Uses `Plasma5Support.DataSource` with "executable" engine to `cat` the credentials file. Never hardcode that path — build it with the helpers in `main.qml` (`credentialsFileExpr()`, `claudeDirExpr()`, `claudeDirEnvPrefix()`, `readCredentialsCmd()`, `readAccountCmd()`), which resolve the `credentialsPath` setting and fall back to `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`. User-supplied paths must go through `shQuotePath()`.
2. **API calls**: Uses QML's built-in `XMLHttpRequest` to call Anthropic's OAuth usage API
3. **UI**: Standard Plasma/Kirigami components

## Key Files

- `contents/ui/main.qml` - All widget logic and UI
- `contents/icons/claude.svg` - Claude logo (orange #D97757)
- `metadata.json` - Plasma widget metadata
- `install.sh` - Installation script

## API Endpoint

```
GET https://api.anthropic.com/api/oauth/usage
Headers:
  Authorization: Bearer <oauth-token>
  Content-Type: application/json
  anthropic-beta: oauth-2025-04-20
```

The `anthropic-beta: oauth-2025-04-20` header is **required** - without it the API returns 401.

## Response Structure

```json
{
  "five_hour": {
    "utilization": 14.0,
    "resets_at": "2025-11-29T19:00:00+00:00"
  },
  "seven_day": {
    "utilization": 89.0,
    "resets_at": "2025-12-01T19:00:00+00:00"
  },
  "seven_day_sonnet": {
    "utilization": 31.0,
    "resets_at": "..."
  },
  "seven_day_opus": null
}
```

## Credentials Location

Claude Code stores OAuth credentials in `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json`. The `credentialsPath` setting overrides this: a value ending in `.json` is the file, anything else is the config folder. The resolved folder also drives the account file, the `projects/` token-stats scan, and the `CLAUDE_CONFIG_DIR` handed to the `claude` process the widget launches.

Note the asymmetry in Claude Code's own layout: by default `.claude.json` (account info) is a **sibling** of the config folder (`~/.claude.json`), but with `CLAUDE_CONFIG_DIR` set it lives **inside** it — `readAccountCmd()` tries the folder first and falls back to `$HOME`.

The file looks like:

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1764462495036,
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
```

## Plan Tiers

- `default_claude_pro` → "Pro"
- `default_claude_max_5x` → "Max 5x"
- `default_claude_max_20x` → "Max 20x"

## Testing

1. Install: `./install.sh`
2. Restart Plasma: `kquitapp6 plasmashell && kstart plasmashell`
3. Check logs: `journalctl --user -f | grep -i claude`

## Common Issues

- **StandardPaths not working**: Use `$HOME` environment variable instead
- **API returns 401**: Make sure `anthropic-beta` header is included
- **Widget not updating**: Check if credentials file exists and is readable
- **Token stats empty**: `refreshTokenStats()` passes `-newer /tmp/.claude-token-stats-marker` to `find`, but nothing ever creates that marker, so `find` aborts and prints nothing

## Publishing

To publish to KDE Store:
1. Create a `.plasmoid` package: `zip -r claude-usage-widget.plasmoid metadata.json contents/`
2. Upload to https://store.kde.org/

## Fork: Codex support (ericbond007, 2026-10-07)

This branch is upstream v2.4.1 plus Codex. Everything Codex-related is marked "fork addition" in comments:

- `contents/scripts/codex-usage.sh` — starts `codex app-server --stdio`, sends `initialize` then `account/rateLimits/read` (JSON-RPC over stdio), prints the `id:2` response. `result.rateLimits.primary/secondary` carry `usedPercent`, `windowDurationMins`, `resetsAt` (epoch seconds); `planType` is the plan.
- `main.qml` — `codex*` properties, `codexReader`, `fetchCodexUsage()`, its own `codexRefreshTimer` (Claude's `refreshTimer` pauses on Claude rate limits), cache fields, tooltip, classic `classicCodexComp`, `withMissingCards()`, `migrateLegacyConfig()`.
- `CompactView.qml` / `CodexBadge.qml` — panel metrics for text/bar/ring; `FullView.qml` — `cardCodexComp`.
- Fable: upstream's generic `limits[]` handling (`modelLimits`, `showModelLimits`) covers it; do not re-add a dedicated tracker.

Lint with the **Qt 6** linter: `/usr/lib/qt6/bin/qmllint` (`/usr/bin/qmllint` is Qt 5 and reports nothing useful). It exits 0 even with warnings — compare its output against the upstream baseline (all `[unqualified]` from `root.` access in child files).

