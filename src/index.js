const { app, BrowserWindow, ipcMain, safeStorage, Notification, dialog, shell, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { version } = require('os');

const LICENSE_SITE_BASE_URL = 'https://inneroutliner.com';
const LICENSE_SITE_LOCALE_PATTERN = /^[a-z]{2}(_[a-z]{2})?$/i;

// License public key for offline verification (RSA 2048-bit)
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkGXZXMe245QkCyydlCja
99OnzXAbgIyRmorBD12O0YFY3D88iT33MeO2lVmvxb5QxxUxuMDi4ZNWM+vqF1yB
qgEWLGl2SNTk8nOO6xq5r/c9fcpOMM8pDCex6uxHQl5uHsrZvVKsJFgj13V9tCb9
j8TDqs/LRzJcMSjtN9vRAITJcqaGjI1a7dQ1UXoSV8GNaWySc+FIhI8Wplgl+p1v
DamBaKRaWjtXchCPAQSffjDcMeDrPAfVk4WJ+fzRD20igxkmbFIs5TiS10l6AVwo
OO4MfFx18ATCO6q6jsrvilRXpQUIg1tD1WjLru5mMe6r45T5p/w/qkIRi7EDxVcC
lwIDAQAB
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
let updateCheckInProgress = false;
let updateDownloaded = false;

// --- Auto-hide near screen edge
const AUTO_HIDE_EDGE_THRESHOLD = 10; // px: how close to an edge counts as "docked"
const AUTO_HIDE_SLIVER_SIZE = 4; // px: visible sliver when collapsed
const AUTO_HIDE_HOVER_ZONE = 8; // px: hover trigger zone when collapsed
const AUTO_HIDE_HOVER_SUPPRESS = 500; // ms: ignore hover-to-expand right after collapsing, so the cursor can clear the sliver first
const AUTO_HIDE_ANIM_DURATION = 220; // ms
const AUTO_HIDE_ANIM_FPS = 60;
const autoHideState = {
  collapsed: false,
  animating: false,
  edge: null, // 'left' | 'right' | 'top' | 'bottom'
  expandedBounds: null,
  animTimer: null,
  suppressHoverUntil: 0
};

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateWindowBounds(from, to, onDone) {
  if (autoHideState.animTimer) {
    clearInterval(autoHideState.animTimer);
    autoHideState.animTimer = null;
  }
  autoHideState.animating = true;
  const stepMs = 1000 / AUTO_HIDE_ANIM_FPS;
  const startTime = Date.now();

  autoHideState.animTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      clearInterval(autoHideState.animTimer);
      autoHideState.animTimer = null;
      autoHideState.animating = false;
      return;
    }
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / AUTO_HIDE_ANIM_DURATION);
    const eased = easeInOutQuad(progress);
    mainWindow.setBounds({
      x: Math.round(from.x + (to.x - from.x) * eased),
      y: Math.round(from.y + (to.y - from.y) * eased),
      width: Math.round(from.width + (to.width - from.width) * eased),
      height: Math.round(from.height + (to.height - from.height) * eased)
    });
    if (progress >= 1) {
      clearInterval(autoHideState.animTimer);
      autoHideState.animTimer = null;
      autoHideState.animating = false;
      if (onDone) onDone();
    }
  }, stepMs);
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
}

function getDockedEdge(bounds, workArea) {
  const distances = {
    left: Math.abs(bounds.x - workArea.x),
    right: Math.abs((workArea.x + workArea.width) - (bounds.x + bounds.width)),
    top: Math.abs(bounds.y - workArea.y),
    bottom: Math.abs((workArea.y + workArea.height) - (bounds.y + bounds.height))
  };
  const closest = Object.keys(distances).reduce((a, b) => distances[a] <= distances[b] ? a : b);
  return distances[closest] <= AUTO_HIDE_EDGE_THRESHOLD ? closest : null;
}

function collapseToEdge(edge) {
  if (!mainWindow || mainWindow.isDestroyed() || autoHideState.animating) return;
  autoHideState.expandedBounds = mainWindow.getBounds();
  autoHideState.edge = edge;
  const bounds = autoHideState.expandedBounds;
  let newBounds = { ...bounds };
  if (edge === 'left') newBounds.x = bounds.x - bounds.width + AUTO_HIDE_SLIVER_SIZE;
  else if (edge === 'right') newBounds.x = bounds.x + bounds.width - AUTO_HIDE_SLIVER_SIZE;
  else if (edge === 'top') newBounds.y = bounds.y + bounds.height + AUTO_HIDE_SLIVER_SIZE;
  else if (edge === 'bottom') newBounds.y = bounds.y + bounds.height - AUTO_HIDE_SLIVER_SIZE;
  autoHideState.collapsed = true;
  autoHideState.suppressHoverUntil = Date.now() + AUTO_HIDE_HOVER_SUPPRESS;
  animateWindowBounds(bounds, newBounds);
}

function expandFromEdge() {
  if (!mainWindow || mainWindow.isDestroyed() || !autoHideState.expandedBounds || autoHideState.animating) return;
  const from = mainWindow.getBounds();
  const to = autoHideState.expandedBounds;
  autoHideState.collapsed = false;
  animateWindowBounds(from, to);
}

function getHoverZoneRect(bounds, edge) {
  switch (edge) {
    case 'left': return { x: bounds.x, y: bounds.y, width: AUTO_HIDE_HOVER_ZONE, height: bounds.height };
    case 'right': return { x: bounds.x + bounds.width - AUTO_HIDE_HOVER_ZONE, y: bounds.y, width: AUTO_HIDE_HOVER_ZONE, height: bounds.height };
    case 'top': return { x: bounds.x, y: bounds.y, width: bounds.width, height: AUTO_HIDE_HOVER_ZONE };
    case 'bottom': return { x: bounds.x, y: bounds.y + bounds.height - AUTO_HIDE_HOVER_ZONE, width: bounds.width, height: AUTO_HIDE_HOVER_ZONE };
    default: return null;
  }
}

// Triggered by the OS after the user finishes dragging the window (mouse released),
// not for programmatic bounds changes such as our own collapse/expand animation.
function handleWindowMoved() {
  if (autoHideState.animating || autoHideState.collapsed) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const bounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const edge = getDockedEdge(bounds, workArea);
  if (edge) {
    collapseToEdge(edge);
  }
}

// Poll the cursor purely to detect hovering the collapsed sliver so it can expand back out.
function checkAutoHide() {
  if (!autoHideState.collapsed || autoHideState.animating) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  if (Date.now() < autoHideState.suppressHoverUntil) return;

  const cursor = screen.getCursorScreenPoint();
  const currentBounds = mainWindow.getBounds();
  const hoverZone = getHoverZoneRect(currentBounds, autoHideState.edge);
  if (hoverZone && pointInRect(cursor, hoverZone)) {
    expandFromEdge();
  }
}

setInterval(checkAutoHide, 150);

const gotTheLock = app.requestSingleInstanceLock();

function checkForUpdates() {
  if (!app.isPackaged) {
    return { status: 'development' };
  }

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'jiang-ning',
    name: 'inneroutliner'
  });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  return autoUpdater.checkForUpdates();
}

function sendUpdateEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

autoUpdater.on('update-available', (info) => {
  sendUpdateEvent('update-available', { version: info.version });
  autoUpdater.downloadUpdate().catch((error) => {
    sendUpdateEvent('update-error', { message: error.message });
  });
});

autoUpdater.on('update-not-available', () => {
  updateCheckInProgress = false;
  sendUpdateEvent('update-not-available');
});

autoUpdater.on('update-downloaded', (info) => {
  updateCheckInProgress = false;
  updateDownloaded = true;
  sendUpdateEvent('update-downloaded', { version: info.version });
});

autoUpdater.on('error', (error) => {
  updateCheckInProgress = false;
  sendUpdateEvent('update-error', { message: error.message });
});

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

    mainWindow.on('moved', handleWindowMoved);

    ipcMain.on('set-always-on-top', (event, enable) => {
      const webContents = event.sender;
      const win = BrowserWindow.fromWebContents(webContents);
      win.setAlwaysOnTop(enable,'screen-saver');
    });

    ipcMain.handle('check-for-updates', async () => {
      if (!app.isPackaged) {
        return { status: 'development' };
      }
      if (updateCheckInProgress) {
        return { status: 'in-progress' };
      }

      updateCheckInProgress = true;
      updateDownloaded = false;
      try {
        await checkForUpdates();
        return { status: 'checking' };
      } catch (error) {
        updateCheckInProgress = false;
        return { status: 'error', message: error.message };
      }
    });

    ipcMain.handle('install-update', () => {
      if (!updateDownloaded) {
        return { status: 'not-ready' };
      }
      autoUpdater.quitAndInstall();
      return { status: 'installing' };
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

    ipcMain.handle('open-checkout', async (event, locale) => {
      try {
        const safeLocale = LICENSE_SITE_LOCALE_PATTERN.test(locale || '') ? locale : 'en';
        const checkoutUrl = new URL(`${LICENSE_SITE_BASE_URL}/${safeLocale}/license/index.html`);
        // only ever open our own site's hosted domain
        if (checkoutUrl.hostname !== 'inneroutliner.com') {
          return { success: false, message: 'Checkout URL is not configured correctly.' };
        }
        await shell.openExternal(checkoutUrl.toString());
        return { success: true };
      } catch (e) {
        return { success: false, message: 'Failed to open checkout page.' };
      }
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

    // --- Reminder scheduler (main-process timer) ---
    let pendingReminders = []; // Array of { id, remind, content }

    ipcMain.on('sync-reminders', (event, reminders) => {
      pendingReminders = reminders || [];
    });

    setInterval(() => {
      if (pendingReminders.length === 0) return;
      const now = Date.now();
      const fired = [];
      pendingReminders = pendingReminders.filter(r => {
        if (r.remind && r.remind <= now) {
          fired.push(r);
          return false;
        }
        return true;
      });
      fired.forEach(r => {
        const notification = new Notification({
          title: r.title || 'Reminder',
          body: r.content
        });
        notification.on('click', () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          }
        });
        notification.show();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('reminder-fired', r.id);
        }
      });
    }, 30000); // Check every 30 seconds

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

    ipcMain.handle('save-text-file', async (event, { defaultName, content, filters }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win || mainWindow, {
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters: Array.isArray(filters) && filters.length > 0
          ? filters
          : [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) {
        return { success: false };
      }
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    });

    ipcMain.handle('open-text-file', async (event, { filters }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win || mainWindow, {
        properties: ['openFile'],
        filters: Array.isArray(filters) && filters.length > 0
          ? filters
          : [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false };
      }
      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, filePath, content };
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
