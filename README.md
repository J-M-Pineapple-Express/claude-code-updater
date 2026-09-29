# Claude Code Updater

A small desktop app that tells you what's new in Claude Code in plain English, then updates it with one click. Windows and macOS.

When you open it, it:

1. Finds your installed `claude` and its version.
2. Checks GitHub for newer Claude Code releases.
3. Has **your own Claude Code** read the release notes and summarize what matters to a daily terminal user. That's the bundled *review changelog* prompt in [`skill/review-changelog.md`](skill/review-changelog.md), run through `claude -p` with Sonnet. The raw release notes are one tab over, and they're what you get if the summary fails.
4. Updates when you click **Update**.

It only runs when you open it. Nothing runs in the background.

---

## Download

Grab the latest installer from the **[Releases page](https://github.com/J-M-Pineapple-Express/claude-code-updater/releases/latest)**.

| OS | File |
|----|------|
| Windows (x64) | `ClaudeCodeUpdater-Setup-x.y.z.exe` |
| macOS (Apple Silicon) | `ClaudeCodeUpdater-x.y.z-arm64.dmg` |
| macOS (Intel) | `ClaudeCodeUpdater-x.y.z-x64.dmg` |

> The app is **not code-signed or notarized**, so the OS will warn on first launch.
>
> **Windows:** click **More info → Run anyway**.
>
> **macOS:**
> 1. Drag **Claude Code Updater** into `/Applications`.
> 2. Open **Terminal** and run:
>    ```bash
>    xattr -dr com.apple.quarantine "/Applications/Claude Code Updater.app"
>    ```
> 3. Launch it normally.
>
> "Claude Code Updater is damaged and can't be opened" is the same quarantine block, and the `xattr` command clears it.

---

## How updating works

The app runs the right updater for how Claude Code was installed:

| Install | Command |
|---|---|
| Native installer (the default) | `claude update` |
| Homebrew | `brew upgrade --cask claude-code` |
| npm | `npm install -g @anthropic-ai/claude-code@latest` |

A `claude` that belongs to a VS Code or Cursor extension is left alone. Update that one from the editor.

**Windows:** Windows can't replace `claude.exe` while any Claude Code session is running. When sessions are open, the app offers to close them first (it asks before it does). Anything mid-reply stops. Pick the conversation back up with `claude --continue`. After updating, if your PATH still finds an older copy of `claude.exe` somewhere else (for example one copied into a system folder), the app copies the new one over it, asking for admin rights if that folder needs them.

**macOS:** running sessions don't block the update. They keep the old version until you restart them.

The summary spends a little of your Claude usage (one Sonnet request). It's cached, so reopening the app for the same update doesn't spend it again.

---

## Development

```bash
npm install
npm start          # run the app
npm test           # unit tests
node core.js status     # what's installed, what's running
node core.js releases   # newer releases on GitHub
node core.js dryrun     # walk through an update without changing anything
```

Test switches: `CCU_PRETEND_VERSION=2.1.282` pretends an older version is installed, and `CCU_SCREENSHOT=out.png` saves a screenshot and quits.

Pushing a `v*` tag builds the Windows and macOS installers in GitHub Actions and attaches them to a release.
