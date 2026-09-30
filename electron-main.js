'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const core = require('./core');

let win = null;

// Summaries cost a little of the user's Claude usage, so cache them per version range.
const cacheFile = () => path.join(app.getPath('userData'), 'summaries.json');
function readCache() {
  try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch { return {}; }
}
function writeCache(c) {
  try { fs.writeFileSync(cacheFile(), JSON.stringify(c, null, 2)); } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 520,
    minHeight: 480,
    title: 'Claude Code Updater',
    backgroundColor: '#1b1a18',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'public', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Test hook: CCU_SCREENSHOT=<file.png> saves the window after CCU_SCREENSHOT_DELAY ms, then quits.
  if (process.env.CCU_SCREENSHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.CCU_SCREENSHOT, img.toPNG());
      app.quit();
    }, Number(process.env.CCU_SCREENSHOT_DELAY || 5000)));
  }
}

ipcMain.handle('status', () => core.getStatus());

ipcMain.handle('releases', (_e, installed) => core.getReleases(installed));

// `lookback` summarizes a range of past releases the user picked; `peek` only returns
// a cached summary, so browsing past releases never spends usage until they ask.
ipcMain.handle('summary', async (_e, { claudePath, installed, releases, force, lookback, peek }) => {
  const newest = releases[0] && releases[0].version;
  const key = lookback
    ? `past:${releases[releases.length - 1].version}->${newest}`
    : `${installed || 'none'}->${newest}`;
  const cache = readCache();
  if (!force && cache[key]) return { text: cache[key], cached: true };
  if (peek) return null;
  const text = await core.summarize(claudePath, releases, installed, { lookback });
  cache[key] = text;
  writeCache(cache);
  return { text, cached: false };
});

ipcMain.handle('update', (_e, { latest, closeSessions }) =>
  core.runUpdate({ latest, closeSessions }, (line) => {
    if (win && !win.isDestroyed()) win.webContents.send('log', line);
  }));

ipcMain.handle('open-external', (_e, url) => {
  if (/^https:\/\//.test(String(url))) shell.openExternal(url);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
