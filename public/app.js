'use strict';

const $ = (id) => document.getElementById(id);
const api = window.updater;
const IS_WIN = api.platform === 'win32';

const state = { status: null, releases: null, summary: null, summaryError: null, view: 'summary', busy: false };

function setNews(html) { $('news-body').innerHTML = html; document.querySelector('main').scrollTop = 0; }
function muted(text) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = text; return p.outerHTML; }

function rawNotesHtml() {
  return state.releases.newer
    .map((r) => `<h3>v${r.version} <span class="muted small">${r.date}</span></h3>` + window.renderMarkdown(r.notes))
    .join('');
}

function renderNews() {
  const newer = state.releases ? state.releases.newer : [];
  if (!newer.length) return;
  $('tabs').hidden = false;
  $('tab-summary').classList.toggle('active', state.view === 'summary');
  $('tab-raw').classList.toggle('active', state.view === 'raw');
  if (state.view === 'raw') return setNews(rawNotesHtml());
  if (state.summary) return setNews(window.renderMarkdown(state.summary));
  if (state.summaryError) {
    return setNews(muted(`Couldn't get a summary from Claude (${state.summaryError}). Here are the release notes instead.`) + rawNotesHtml());
  }
  setNews('<div class="spinner-row"><span class="spinner"></span><span>Claude is reading the changelog for you…</span></div>');
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
  $('tabs').hidden = true;
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
    $('news-title').textContent = "You're up to date";
    return setNews(muted(`v${p.version} is the latest Claude Code release.`));
  }
  const count = state.releases.newer.length;
  $('news-title').textContent = `What's new in ${count} release${count === 1 ? '' : 's'}`;
  renderNews();
  try {
    const r = await api.summary({ claudePath: p.path, installed: p.version, releases: state.releases.newer });
    state.summary = r.text;
  } catch (e) {
    state.summaryError = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
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
$('news-body').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-href]');
  if (a) { e.preventDefault(); api.openExternal(a.dataset.href); }
});

load();
