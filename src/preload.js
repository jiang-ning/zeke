// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld('electronAPI', {
  setAlwaysOnTop: (enable) => ipcRenderer.send('set-always-on-top', enable),
  // isAlwaysOnTop: () => ipcRenderer.send('is-always-on-top'),
  maximize: () => ipcRenderer.send('maximize'),
  unmaximize: () => ipcRenderer.send('unmaximize'),
  isMaximized: () => ipcRenderer.send('is-maximized'),
  minimize: () => ipcRenderer.send('minimize'),
  isMinimized: () => ipcRenderer.send('is-minimized'),
  close: () => ipcRenderer.send('close'),
  getBounds: () => ipcRenderer.invoke('get-bounds'),
  setBounds: (bounds) => ipcRenderer.send('set-bounds', bounds),
  licenseActivate: (licenseKey) => ipcRenderer.invoke('license-activate', licenseKey),
  licenseGet: () => ipcRenderer.invoke('license-get'),
  licenseRemove: () => ipcRenderer.invoke('license-remove'),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  saveFile: (defaultName, content) => ipcRenderer.invoke('save-file', { defaultName, content }),
});
