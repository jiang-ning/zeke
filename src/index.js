const { app, BrowserWindow, ipcMain } = require('electron');
const { updateElectronApp } = require('update-electron-app');
const path = require('path');

updateElectronApp({
  notifyUser: true
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 300,
    minHeight: 160,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true
    },
    titleBarStyle: 'hidden',
    transparent: true,
    frame: false
  });

  ipcMain.on('set-always-on-top', (event, enable) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.setAlwaysOnTop(enable,'screen-saver');
  });

  // ipcMain.on('is-always-on-top', async (event) => {
  //   const webContents = event.sender
  //   const win = BrowserWindow.fromWebContents(webContents)
  //   const result = await win.isAlwaysOnTop()
  //   return result
  // });

  ipcMain.on('maximize', (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.maximize();
  });

  ipcMain.on('unmaximize', (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.unmaximize();
  });

  ipcMain.on('is-maximized', (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.isMaximized();
  });

  ipcMain.on('minimize', (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.minimize();
  });

  ipcMain.on('is-minimized', (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.isMinimized();
  });

  // TODO: issue on mac after reboot app
  ipcMain.handle('get-bounds', async (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    const bounds = await win.getBounds();
    return bounds;
  });

  ipcMain.on('set-bounds', (event, bounds) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.setBounds(bounds);
  });

  ipcMain.on('close', (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.close();
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
