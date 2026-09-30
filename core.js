// Core logic for Claude Code Updater. Plain Node (no Electron imports) so it can be
// tested from the command line: `node core.js status` / `releases` / `summary`.
'use strict';

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const HOME = os.homedir();
const RELEASES_URL = 'https://api.github.com/repos/anthropics/claude-code/releases?per_page=100';
const PROMPT_FILE = path.join(__dirname, 'skill', 'review-changelog.md');

// ---------- small helpers ----------

function run(cmd, args, { timeout = 15000, env, cwd } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, env: env || process.env, cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), err }));
  });
}

function parseVersion(text) {
  const m = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function cmpVersion(a, b) {
  const pa = String(a || '0.0.0').split('.').map(Number);
  const pb = String(b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function exists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------- PATH discovery ----------

// An app launched from Finder gets a bare PATH (/usr/bin:/bin:...), so on macOS ask the
// user's login shell for the PATH their terminal actually uses.
let cachedPath = null;
async function userPath() {
  if (cachedPath) return cachedPath;
  let p = process.env.PATH || '';
  if (IS_MAC) {
    const shell = process.env.SHELL || '/bin/zsh';
    const r = await run(shell, ['-ilc', 'printf "__PATH__%s__END__" "$PATH"'], { timeout: 8000 });
    const m = r.stdout.match(/__PATH__(.*)__END__/s);
    if (m && m[1]) p = m[1];
    const extra = [path.join(HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
    for (const e of extra) if (!p.split(':').includes(e)) p += ':' + e;
  } else if (IS_WIN) {
    const local = path.join(HOME, '.local', 'bin');
    if (!p.toLowerCase().split(';').includes(local.toLowerCase())) p += ';' + local;
  }
  cachedPath = p;
  return p;
}

function envWithPath(p) {
  const env = { ...process.env };
  if (IS_WIN) {
    // Windows env keys are case-insensitive but Node copies them verbatim.
    for (const k of Object.keys(env)) if (k.toLowerCase() === 'path') delete env[k];
    env.Path = p;
  } else {
    env.PATH = p;
  }
  return env;
}

// Every claude binary reachable on PATH, in PATH order, plus the native installer's
// location even when it isn't on PATH yet.
async function findInstalls() {
  const p = await userPath();
  const sep = IS_WIN ? ';' : ':';
  const names = IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const seen = new Set();
  const found = [];
  const add = (file, onPath) => {
    let real = file;
    try { real = fs.realpathSync(file); } catch {}
    const key = IS_WIN ? real.toLowerCase() : real;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ path: file, realPath: real, onPath });
  };
  for (const dir of p.split(sep).filter(Boolean)) {
    for (const n of names) {
      const f = path.join(dir, n);
      if (exists(f)) add(f, true);
    }
  }
  const native = path.join(HOME, '.local', 'bin', IS_WIN ? 'claude.exe' : 'claude');
  if (exists(native)) add(native, false);

  const env = envWithPath(p);
  await Promise.all(found.map(async (f) => {
    const r = IS_WIN && f.path.toLowerCase().endsWith('.cmd')
      ? await run('cmd.exe', ['/d', '/c', f.path, '--version'], { env })
      : await run(f.path, ['--version'], { env });
    f.version = parseVersion(r.stdout) || parseVersion(r.stderr);
    f.method = installMethod(f);
  }));
  return found;
}

function installMethod(f) {
  const s = (f.realPath || f.path).replace(/\\/g, '/').toLowerCase();
  if (s.includes('/homebrew/') || s.includes('/caskroom/') || s.includes('/cellar/')) return 'homebrew';
  if (s.includes('node_modules') || s.endsWith('.cmd') || s.includes('/npm/')) return 'npm';
  if (s.includes('/.vscode/extensions/') || s.includes('/.cursor/extensions/')) return 'editor-extension';
  return 'native';
}

// ---------- running sessions ----------

async function runningSessions() {
  if (IS_WIN) {
    const r = await run('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH']);
    return r.stdout.split(/\r?\n/)
      .filter((l) => /^"claude\.exe"/i.test(l))
      .map((l) => ({ pid: Number(l.split('","')[1]) }));
  }
  const r = await run('pgrep', ['-x', 'claude']);
  return r.stdout.split('\n').filter(Boolean).map((pid) => ({ pid: Number(pid) }));
}

// ---------- status ----------

async function getStatus() {
  const installs = await findInstalls();
  const primary = installs.find((i) => i.onPath) || installs[0] || null;
  // Test hook: pretend to be on an older version to exercise the "update available" view.
  if (primary && process.env.CCU_PRETEND_VERSION) primary.version = process.env.CCU_PRETEND_VERSION;
  const sessions = await runningSessions();
  return { platform: process.platform, installs, primary, sessions };
}

// ---------- releases ----------

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'claude-code-updater', Accept: 'application/vnd.github+json' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`GitHub answered ${res.statusCode}${res.statusCode === 403 ? ' (rate limited, try again in an hour)' : ''}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('GitHub request timed out')));
    req.on('error', reject);
  });
}

// Releases newer than `installed`, newest first (with no installed version, just the
// latest), plus `all` recent releases for looking back at past changelogs.
async function getReleases(installed) {
  const all = (await fetchJson(RELEASES_URL))
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({ version: parseVersion(r.tag_name), date: (r.published_at || '').slice(0, 10), url: r.html_url, notes: r.body || '' }))
    .filter((r) => r.version)
    .sort((a, b) => cmpVersion(b.version, a.version));
  const latest = all[0] || null;
  const newer = installed ? all.filter((r) => cmpVersion(r.version, installed) > 0) : all.slice(0, 1);
  return { latest, newer, all };
}

// ---------- changelog summary (the bundled review-changelog skill) ----------

const MAX_SUMMARY_RELEASES = 20;

// `lookback`: the releases are ones they already have (browsing past changelogs), so the
// summary is about what's there to use now rather than what to expect from an update.
function buildPrompt(releases, installed, { lookback = false } = {}) {
  const skill = fs.readFileSync(PROMPT_FILE, 'utf8');
  const platform = IS_MAC ? 'macOS' : IS_WIN ? 'Windows' : process.platform;
  const notes = releases.slice(0, MAX_SUMMARY_RELEASES).map((r) => `## v${r.version} (${r.date})\n${r.notes}`).join('\n\n');
  const mode = lookback
    ? '\n\nThey have already updated past all of these releases and are looking back at what changed. Frame it as what they can use now and what got fixed, not as what to expect before updating.'
    : '';
  return `${skill}\n\n---\n\nThis machine runs ${platform}. Installed version: ${installed ? 'v' + installed : 'unknown'}.${mode}\n\nRelease notes to summarize:\n\n${notes}`;
}

// Runs the user's own Claude Code headless. The prompt goes in on stdin because release
// notes easily exceed the Windows command-line limit.
function summarize(claudePath, releases, installed, { timeoutMs = 240000, lookback = false } = {}) {
  return new Promise(async (resolve, reject) => {
    const env = envWithPath(await userPath());
    const isCmd = IS_WIN && claudePath.toLowerCase().endsWith('.cmd');
    const args = ['-p', '--model', 'sonnet', '--output-format', 'text'];
    const child = isCmd
      ? spawn('cmd.exe', ['/d', '/c', claudePath, ...args], { env, cwd: os.tmpdir(), windowsHide: true })
      : spawn(claudePath, args, { env, cwd: os.tmpdir(), windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude took too long to summarize')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error((err || out || `claude exited with code ${code}`).trim().slice(0, 500)));
    });
    child.stdin.end(buildPrompt(releases, installed, { lookback }));
  });
}

// ---------- update ----------

function killSessions(log) {
  return new Promise(async (resolve) => {
    for (let i = 1; i <= 8; i++) {
      const left = await runningSessions();
      if (left.length === 0) { log('All Claude Code sessions are closed.'); return resolve(true); }
      log(`Closing ${left.length} Claude Code session(s)...`);
      if (IS_WIN) await run('taskkill', ['/IM', 'claude.exe', '/F']);
      else await run('pkill', ['-x', 'claude']);
      await new Promise((r) => setTimeout(r, 1500));
    }
    const still = await runningSessions();
    log(still.length ? `Warning: ${still.length} session(s) would not close. The update may fail.` : 'All Claude Code sessions are closed.');
    resolve(still.length === 0);
  });
}

function streamCommand(cmd, args, log, { timeoutMs = 300000, env } = {}) {
  return new Promise((resolve) => {
    log(`> ${[cmd, ...args].join(' ')}`);
    const child = spawn(cmd, args, { env, cwd: os.tmpdir(), windowsHide: true });
    const timer = setTimeout(() => { log('Timed out after 5 minutes, stopping.'); child.kill(); }, timeoutMs);
    const onData = (d) => String(d).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach(log);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => { clearTimeout(timer); log(`Could not start: ${e.message}`); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

function updateCommandFor(install) {
  switch (install.method) {
    case 'homebrew': return { cmd: 'brew', args: ['upgrade', '--cask', 'claude-code'] };
    case 'npm': return IS_WIN
      ? { cmd: 'cmd.exe', args: ['/d', '/c', 'npm', 'install', '-g', '@anthropic-ai/claude-code@latest'] }
      : { cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code@latest'] };
    default: return { cmd: install.path, args: ['update'] };
  }
}

// Copy `src` over `dest`; if Windows refuses (a protected folder such as system32),
// retry through an elevated PowerShell, which shows the UAC prompt.
async function copyBinary(src, dest, log) {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch (e) {
    if (!IS_WIN || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { log(`Copy failed: ${e.message}`); return false; }
    log('That folder needs admin rights. Approve the Windows prompt to finish.');
    const q = (s) => s.replace(/'/g, "''");
    const inner = `Copy-Item -Force -LiteralPath '${q(src)}' -Destination '${q(dest)}'`;
    const outer = `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',"${inner.replace(/"/g, '`"')}"`;
    const r = await run('powershell', ['-NoProfile', '-Command', outer], { timeout: 120000 });
    if (!r.ok) log(`Admin copy failed or was cancelled: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    return r.ok;
  }
}

// The whole update. `log` receives progress lines. Returns the final status.
async function runUpdate({ latest, closeSessions, dryRun = false }, log) {
  const before = await getStatus();
  const primary = before.primary;
  if (!primary) throw new Error('Claude Code was not found on this computer.');
  log(`Installed: v${primary.version || '?'} at ${primary.path} (${primary.method})`);
  if (primary.method === 'editor-extension') {
    throw new Error('The claude on your PATH belongs to a VS Code or Cursor extension. Update it from the editor instead.');
  }

  if (before.sessions.length) {
    if (IS_WIN && closeSessions) {
      if (dryRun) log(`[dry run] Would close ${before.sessions.length} session(s).`);
      else await killSessions(log);
    } else if (IS_WIN) {
      log(`${before.sessions.length} session(s) are open, which can block the update on Windows.`);
    } else {
      log(`${before.sessions.length} session(s) are open. They keep the old version until you restart them.`);
    }
  }

  const env = envWithPath(await userPath());
  const { cmd, args } = updateCommandFor(primary);
  if (dryRun) {
    log(`[dry run] Would run: ${[cmd, ...args].join(' ')}`);
  } else {
    const ok = await streamCommand(cmd, args, log, { env });
    if (!ok) log('The updater reported a problem. Checking what actually got installed...');
    // A Windows update run can leave a claude.exe behind that holds the file.
    if (IS_WIN) await run('taskkill', ['/IM', 'claude.exe', '/F']);
  }

  // The native installer writes to ~/.local/bin. If PATH finds an older copy first
  // (for example one copied into a system folder), bring it up to date.
  let after = await getStatus();
  if (IS_WIN && after.primary) {
    const best = after.installs
      .filter((i) => i.method === 'native' && i.version && i.path.toLowerCase().endsWith('.exe'))
      .sort((a, b) => cmpVersion(b.version, a.version))[0];
    if (best && cmpVersion(best.version, after.primary.version) > 0 && after.primary.method === 'native') {
      log(`PATH still finds v${after.primary.version} at ${after.primary.path}; copying v${best.version} over it.`);
      if (dryRun) log('[dry run] Skipping the copy.');
      else await copyBinary(best.path, after.primary.path, log);
      after = await getStatus();
    }
  }

  const now = after.primary && after.primary.version;
  if (latest && now && cmpVersion(now, latest) >= 0) log(`Done. Claude Code is now v${now}.`);
  else log(`Claude Code reports v${now || '?'}${latest ? ` (latest is v${latest})` : ''}.`);
  return after;
}

module.exports = { getStatus, getReleases, summarize, runUpdate, cmpVersion, parseVersion, buildPrompt, MAX_SUMMARY_RELEASES };

// ---------- CLI for testing ----------
if (require.main === module) {
  (async () => {
    const what = process.argv[2] || 'status';
    const s = await getStatus();
    if (what === 'status') return console.log(JSON.stringify(s, null, 2));
    const rel = await getReleases(s.primary && s.primary.version);
    if (what === 'releases') return console.log(JSON.stringify({ latest: rel.latest && rel.latest.version, newer: rel.newer.map((r) => r.version) }, null, 2));
    if (what === 'summary') {
      const sample = rel.newer.length ? rel.newer : [rel.latest];
      return console.log(await summarize(s.primary.path, sample, s.primary.version));
    }
    if (what === 'dryrun') return runUpdate({ latest: rel.latest && rel.latest.version, closeSessions: true, dryRun: true }, (l) => console.log(l));
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
