# Changelog

## v1.1.0 — 2026-09-30

### Added
- **Past releases.** Look back at earlier Claude Code changelogs even when you're already up to date. Pick a starting version from the last 100 releases; the release notes show right away, and **Summarize with Claude** writes a plain-English look back (what you can use now and what got fixed). Summaries only run when you ask and are cached per range.

## v1.0.0 — 2026-09-29

First release.

### Added
- Finds every `claude` on your PATH (and the native installer's copy in `~/.local/bin`) with its version and install method.
- Checks GitHub for Claude Code releases newer than yours.
- A plain-English summary of what changed, written by your own Claude Code (Sonnet) from the bundled review-changelog prompt. It's cached per update and falls back to the raw release notes.
- One-click update using the right command for native, Homebrew or npm installs.
- Windows: offers to close running Claude Code sessions first, since they lock `claude.exe`, and brings an older copy that PATH finds first up to date, asking for admin rights if needed.
- Windows installer and macOS builds (Apple Silicon and Intel), unsigned.
