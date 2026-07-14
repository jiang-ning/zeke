const { app, BrowserWindow, ipcMain, safeStorage, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// License public key for offline verification (RSA 2048-bit)
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjKprkDQCs/6hvoD28pGF
0DBadXmBP507kIZw9NYfIuwpbEau5oQxErnx7zR0vhC8/uu59nQeGDMZV0AIVpm/
2jyKT6B9iyPku1QfO6WLbIY6HDAR/nxb2FXN8hk443LTt9VBNQs1AJ2Rwht06yg6
eEPGbFBYMweeO8eB8iNsmBXztRYYNJOqGa8A03kwkA62lDc84ANCQ3eSLDCLLj/+
KLK+VJMTTDfQBzlxxAHqCGZjI13DEXEGFJ0vv7rZq4bgm+c8rBBuZwbevtXTDhpE
jtvpVKBKGrnh27Kxu0iO+g0cf7UzasTtymTsQ5RC0DEaoa6M6hYB7H7GKDGWJdlx
rQIDAQAB
-----END PUBLIC KEY-----
`;

const LICENSE_FILE_PATH = path.join(app.getPath('userData'), 'license.dat');

function saveLicenseToFile(encryptedBuffer) {
  fs.writeFileSync(LICENSE_FILE_PATH, encryptedBuffer);
}

function loadLicenseFromFile() {
  if (fs.existsSync(LICENSE_FILE_PATH)) {
    return fs.readFileSync(LICENSE_FILE_PATH);
  }
  return null;
}

function deleteLicenseFile() {
  if (fs.existsSync(LICENSE_FILE_PATH)) {
    fs.unlinkSync(LICENSE_FILE_PATH);
  }
}

function verifyLicense(licenseKey) {
  try {
    // License format: base64(JSON{name, email}) + '.' + base64(signature)
    const parts = licenseKey.trim().split('.');
    if (parts.length !== 2) {
      return { valid: false, message: 'Invalid license format.'};
    }

    const payload = Buffer.from(parts[0], 'base64').toString('utf8');
    const signature = Buffer.from(parts[1], 'base64');

    const parsed = JSON.parse(payload);
    if (!parsed.name || !parsed.email) {
      return { valid: false, message: 'License missing required fields.'};
    }

    const verifier = crypto.createVerify('SHA256');
    verifier.update(payload);
    verifier.end();

    const isValid = verifier.verify(LICENSE_PUBLIC_KEY, signature);

    if (isValid) {
      return { valid: true, name: parsed.name, email: parsed.email, message: 'License activated successfully.'};
    } else {
      return { valid: false, message: 'License signature verification failed.'};
    }
  } catch (e) {
    return { valid: false, message: 'Invalid license key.'};
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow = null;

const gotTheLock = app.requestSingleInstanceLock();

const createWindow = () => {

  if(!gotTheLock) {
    app.quit();
  } else {
    // Create the browser window.
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 360,
      minHeight: 190,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        contextIsolation: true
      },
      titleBarStyle: 'hidden',
      // titleBarStyle: 'customButtonsOnHover', // for mac screenshot
      transparent: true,
      frame: false
    });

    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
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

    // License IPC handlers
    ipcMain.handle('license-activate', async (event, licenseKey) => {
      const result = verifyLicense(licenseKey);
      if (result.valid) {
        // Encrypt and store license using OS-level encryption
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(licenseKey);
          saveLicenseToFile(encrypted);
        } else {
          // Fallback: store as-is (less secure but functional)
          saveLicenseToFile(Buffer.from(licenseKey, 'utf8'));
        }
      }
      return result;
    });

    ipcMain.handle('license-get', async () => {
      const fileData = loadLicenseFromFile();
      if (!fileData) {
        return { valid: false, message: 'No license found.' };
      }
      try {
        let licenseKey;
        if (safeStorage.isEncryptionAvailable()) {
          licenseKey = safeStorage.decryptString(fileData);
        } else {
          licenseKey = fileData.toString('uft8');
        }
        return verifyLicense(licenseKey);
      } catch (e) {
        return { valid: false, message: 'Failed to read stored license.' };
      }
    });

    ipcMain.handle('license-remove', async () => {
      deleteLicenseFile();
      return { valid: false, message: 'License removed.'};
    });

    ipcMain.on('show-notification', (event, { title, body }) => {
      const notification = new Notification({ title, body });
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
      notification.show();
    });

    ipcMain.handle('save-file', async (event, { defaultName, content }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win || mainWindow, {
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
      });
      if (result.canceled || !result.filePath) {
        return { success: false };
      }
      fs.writeFileSync(result.filePath, '\uFEFF' + content, 'utf8');
      return { success: true, filePath: result.filePath };
    });

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Open the DevTools.
    // mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // if (process.platform !== 'darwin') {
    app.quit();
  // }
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
