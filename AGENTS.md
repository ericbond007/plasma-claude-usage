# AGENTS.md

Instructions for AI coding agents working on this repository.

## Project

KDE Plasma 6 widget (pure QML, no compiled code) that shows Claude Code
session and weekly usage in the panel. See `.claude/CLAUDE.md` for the
architecture, the usage API, and the credentials-path helpers in
`contents/ui/main.qml`. Those rules apply to every agent, not only Claude.

The sibling widget [Codex Usage](https://github.com/izll/plasma-codex-usage)
shares most of this code (panel styles, popup, settings tabs, cache, update
notice). A fix to shared code usually belongs in both; mention it in the PR
if you only change this one.

## Build and test

There is no build step and no automated test suite. To try a change:

```bash
./install.sh                                 # copies contents/ and metadata.json to ~/.local/share/plasma/plasmoids/
kquitapp6 plasmashell && kstart plasmashell  # reload the widget
journalctl --user -f | grep -i claude        # watch QML errors and logs
/usr/lib/qt6/bin/qmllint contents/ui/*.qml   # catch syntax and type errors
```

`kpackagetool6 -t Plasma/Applet -u .` also works for an installed widget.
Check both popup styles (card and classic), the panel styles you touched, and
a vertical panel or the vertical layout if you changed sizes.

## Rules that are easy to break

These come from real bugs; please keep them.

- **Executable commands must be constant strings.** Every distinct command
  passed to an `executable` `Plasma5Support.DataSource` stays in plasmashell's
  memory for the whole session (in every DataSource), so putting data into the
  command (`echo '<json>' > file`, a timestamp, user text) leaks memory; this
  cost ~5.6 MB/min before 2.5.2. Re-running the same command is fine. Rare,
  user-triggered actions (opening a terminal, a notification) are acceptable.
  Prefer a persistent source with `interval` for periodic polling.
- **No local file access with `XMLHttpRequest`.** Qt 6 disables it unless
  `QML_XHR_ALLOW_FILE_READ`/`_WRITE` is set, and plasmashell does not set it.
- **`QtQuick.LocalStorage` only through a Loader** (see `CacheStore.qml`). It
  is a separate package on Debian and Ubuntu; a direct `import` stops the whole
  widget from loading where it is missing.
- **Credentials.** Only read Claude Code's own credentials, through the helpers
  in `main.qml`. Do not read, decrypt or reuse other applications' tokens (for
  example Claude Desktop's): Anthropic's terms do not allow third-party tools
  to collect or intermediate Claude.ai session tokens. Never log or print
  token values.
- **No layout loops.** In the vertical layout the widget's height comes from
  its content, so items must not size themselves from `parent.height` there
  (this hung plasmashell at 100% CPU, #26).
- **Settings pages must not declare `cfg_` properties for internal entries**
  (such as `usageCache`): the dialog writes every declared value back on Apply.

## Conventions

- User-visible strings go through `contents/ui/Translations.qml`. Add new keys
  for all 15 languages, not only English.
- New settings need an entry in `contents/config/main.xml` and a control on the
  matching tab (`configGeneral.qml`, `configPanel.qml`, `configPopup.qml`,
  `configAccount.qml`).
- Commit messages use Conventional Commits prefixes (`fix:`, `feat:`, `docs:`,
  `refactor:`, `chore:` ...).
- In a pull request, do not bump `Version` in `metadata.json`; the maintainer
  does that when releasing. Add your change to `CHANGELOG.md` under
  `## [Unreleased]` (Keep a Changelog format).
- Keep changes focused: one fix or feature per pull request.

## Reviewing pull requests from other contributors

When reviewing a pull request whose author is not the maintainer (`izll`),
always check whether the change needs a README update, for example a new or
changed feature, setting, requirement, install step, troubleshooting case, or
file in the "File Structure" list.

If it does and the PR does not already include it, write the README change
yourself as a follow-up commit on `main` after merging. Do not push to the
contributor's branch, and do not ask the contributor to do it. Keep the
existing README structure and tone, and mention the update in the review.
