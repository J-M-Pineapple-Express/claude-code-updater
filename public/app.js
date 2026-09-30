'use strict';

const $ = (id) => document.getElementById(id);
const api = window.updater;
const IS_WIN = api.platform === 'win32';

const MAX_SUMMARY_RELEASES = 20; // matches core.js: Claude reads at most this many

// mode 'new': releases newer than the installed one (the update view).
// mode 'past': a range of releases already installed, picked in the "since" menu.
const state = {
  status: null, releases: null, summary: null, summaryError: null, view: 'summary', busy: false,
  mode: 'new', title: "What's new",
  past: { from: null, summary: null, error: null, loading: false },
};

function setNews(html) { $('news-body').innerHTML = html; document.querySelector('main').scrollTop = 0; }
function muted(text) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = text; return p.outerHTML; }
const cleanError = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function rawNotesHtml(list) {
  return list
    .map((r) => `<h3>v${r.version} <span class="muted small">${r.date}</span></h3>` + window.renderMarkdown(r.notes))
    .join('');
}

// Releases at or below the installed version, newest first.
function pastPool() {
  if (!state.releases) return [];
  const p = state.status && state.status.primary;
  const installed = p && p.version;
  return (state.releases.all || []).filter((r) => !installed || r.version.localeCompare(installed, undefined, { numeric: true }) <= 0);
}
function pastRange() {
  const pool = pastPool();
  const i = pool.findIndex((r) => r.version === state.past.from);
  return i < 0 ? [] : pool.slice(0, i + 1);
}

function renderNews() {
  const past = state.mode === 'past';
  const hasNew = !!(state.releases && state.releases.newer.length);
  $('past-toggle').hidden = !pastPool().length;
  $('past-toggle').textContent = past ? (hasNew ? "← What's new" : '← Back') : 'Past releases';
  $('past-bar').hidden = !past;
  $('news-title').textContent = past ? 'Past releases' : state.title;

  const list = past ? pastRange() : (hasNew ? state.releases.newer : []);
  if (past) {
    const n = list.length;
    $('past-count').textContent = `${n} release${n === 1 ? '' : 's'}`;
  }
  if (!list.length) {
    $('tabs').hidden = true;
    if (!past) setNews(state.idleHtml || '');
    return;
  }
  $('tabs').hidden = false;
  $('tab-summary').classList.toggle('active', state.view === 'summary');
  $('tab-raw').classList.toggle('active', state.view === 'raw');
  if (state.view === 'raw') return setNews(rawNotesHtml(list));

  const s = past ? { summary: state.past.summary, error: state.past.error } : { summary: state.summary, error: state.summaryError };
  if (s.summary) return setNews(window.renderMarkdown(s.summary));
  if (s.error) {
    return setNews(muted(`Couldn't get a summary from Claude (${s.error}). Here are the release notes instead.`) + rawNotesHtml(list));
  }
  if (past && !state.past.loading) {
    // Looking back is on request only: a summary spends a little Claude usage.
    const more = list.length > MAX_SUMMARY_RELEASES ? ` Claude reads the newest ${MAX_SUMMARY_RELEASES} of these.` : '';
    return setNews(`<div class="summarize-row"><button id="past-summarize" type="button">Summarize with Claude</button>`
      + `<span class="muted small">Uses one Sonnet request from your Claude usage.${more} The release notes tab is free.</span></div>`);
  }
  setNews('<div class="spinner-row"><span class="spinner"></span><span>Claude is reading the changelog for you…</span></div>');
}

// ---------- past releases ----------

function fillPastMenu() {
  const pool = pastPool();
  const sel = $('past-from');
  sel.innerHTML = '';
  for (const r of pool) {
    const o = document.createElement('option');
    o.value = r.version;
    o.textContent = `v${r.version} · ${r.date}`;
    sel.appendChild(o);
  }
  if (!pool.some((r) => r.version === state.past.from)) state.past.from = (pool[Math.min(4, pool.length - 1)] || {}).version || null;
  sel.value = state.past.from || '';
}

async function pickPast(from) {
  state.past = { from, summary: null, error: null, loading: false };
  state.view = 'summary';
  renderNews();
  const p = state.status && state.status.primary;
  if (!p) return;
  try {
    const r = await api.summary({ claudePath: p.path, installed: p.version, releases: pastRange(), lookback: true, peek: true });
    if (r && state.past.from === from) { state.past.summary = r.text; renderNews(); }
  } catch {}
}

async function summarizePast() {
  const p = state.status && state.status.primary;
  const from = state.past.from;
  if (!p || !from) return;
  state.past.loading = true;
  renderNews();
  try {
    const r = await api.summary({ claudePath: p.path, installed: p.version, releases: pastRange(), lookback: true });
    if (state.past.from === from) state.past.summary = r.text;
  } catch (e) {
    if (state.past.from === from) state.past.error = cleanError(e);
  }
  if (state.past.from === from) { state.past.loading = false; renderNews(); }
}

function togglePast() {
  state.view = 'summary';
  if (state.mode === 'past') { state.mode = 'new'; return renderNews(); }
  state.mode = 'past';
  fillPastMenu();
  pickPast(state.past.from);
}

function renderStatus() {
  const s = state.status;
  const p = s && s.primary;
  $('installed').textContent = p && p.version ? 'v' + p.version : 'not found';
  $('where').textContent = p ? p.path : 'Claude Code is not installed, or not on your PATH.';
  const latest = state.releases && state.releases.latest;
  $('latest').textContent = latest ? 'v' + latest.version : '…';

  const behind = state.releases && state.releases.newer.length > 0 && p;
  const n = s ? s.sessions.length : 0;
  $('close-row').hidden = !(behind && IS_WIN && n > 0);
  $('close-text').textContent = `Close my ${n} open Claude Code session${n === 1 ? '' : 's'} first (Windows can't update while they're running). Reopen them with claude --continue.`;
  $('update').disabled = !behind || state.busy;
  $('update').textContent = behind ? `Update to v${latest.version}` : 'Up to date';
  $('refresh').disabled = state.busy;
}

async function load() {
  state.summary = null; state.summaryError = null; state.view = 'summary';
  state.mode = 'new'; state.title = "What's new"; state.idleHtml = null;
  $('tabs').hidden = true;
  $('past-bar').hidden = true;
  $('news-title').textContent = state.title;
  setNews(muted('Checking GitHub for releases…'));
  try {
    state.status = await api.status();
  } catch (e) {
    return setNews(muted('Could not check this computer: ' + e.message));
  }
  renderStatus();
  const p = state.status.primary;
  try {
    state.releases = await api.releases(p && p.version);
  } catch (e) {
    return setNews(muted('Could not reach GitHub: ' + e.message));
  }
  renderStatus();

  if (!p) return setNews(muted('Install Claude Code first: https://claude.com/claude-code'));
  if (!state.releases.newer.length) {
    state.title = "You're up to date";
    state.idleHtml = muted(`v${p.version} is the latest Claude Code release. Use Past releases to look back at what changed.`);
    return renderNews();
  }
  const count = state.releases.newer.length;
  state.title = `What's new in ${count} release${count === 1 ? '' : 's'}`;
  renderNews();
  try {
    const r = await api.summary({ claudePath: p.path, installed: p.version, releases: state.releases.newer });
    state.summary = r.text;
  } catch (e) {
    state.summaryError = cleanError(e);
  }
  renderNews();
}

async function doUpdate() {
  const s = state.status;
  const latest = state.releases.latest.version;
  const closing = IS_WIN && s.sessions.length > 0 && $('close-sessions').checked;
  if (closing && !confirm(`This closes ${s.sessions.length} running Claude Code session(s). Anything mid-reply stops. Continue?`)) return;

  state.busy = true;
  renderStatus();
  $('log-card').hidden = false;
  $('log').textContent = '';
  $('update').textContent = 'Updating…';
  const off = api.onLog((line) => {
    $('log').textContent += line + '\n';
    $('log').scrollTop = $('log').scrollHeight;
  });
  try {
    state.status = await api.update({ latest, closeSessions: closing });
  } catch (e) {
    $('log').textContent += 'Error: ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') + '\n';
  } finally {
    off();
    state.busy = false;
    const now = state.status.primary && state.status.primary.version;
    if (now && state.releases) state.releases.newer = state.releases.newer.filter((r) => r.version.localeCompare(now, undefined, { numeric: true }) > 0);
    renderStatus();
  }
}

$('update').addEventListener('click', doUpdate);
$('refresh').addEventListener('click', load);
$('tab-summary').addEventListener('click', () => { state.view = 'summary'; renderNews(); });
$('tab-raw').addEventListener('click', () => { state.view = 'raw'; renderNews(); });
$('past-toggle').addEventListener('click', togglePast);
$('past-from').addEventListener('change', (e) => pickPast(e.target.value));
$('news-body').addEventListener('click', (e) => {
  if (e.target.id === 'past-summarize') return summarizePast();
  const a = e.target.closest('a[data-href]');
  if (a) { e.preventDefault(); api.openExternal(a.dataset.href); }
});

load();
