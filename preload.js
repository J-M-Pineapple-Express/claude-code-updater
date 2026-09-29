'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  platform: process.platform,
  status: () => ipcRenderer.invoke('status'),
  releases: (installed) => ipcRenderer.invoke('releases', installed),
  summary: (args) => ipcRenderer.invoke('summary', args),
  update: (args) => ipcRenderer.invoke('update', args),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onLog: (fn) => {
    const handler = (_e, line) => fn(line);
    ipcRenderer.on('log', handler);
    return () => ipcRenderer.removeListener('log', handler);
  },
});
