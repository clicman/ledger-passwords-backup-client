const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

let serverStarted = false;

function waitForServer(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http
        .get(url, () => resolve())
        .on('error', () => {
          if (Date.now() - start > timeout) {
            reject(new Error('Server did not start in time'));
          } else {
            setTimeout(check, 300);
          }
        });
    }
    check();
  });
}

async function createWindow() {
  if (!serverStarted) {
    require('./server');
    serverStarted = true;
  }
  await waitForServer('http://localhost:3000');

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public', 'logo512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL('http://localhost:3000');

  // WebUSB device selection handler
  mainWindow.webContents.session.on(
    'select-usb-device',
    (event, details, callback) => {
      event.preventDefault();
      if (details.deviceList && details.deviceList.length > 0) {
        callback(details.deviceList[0].deviceId);
      } else {
        callback();
      }
    },
  );

  // WebHID device selection handler
  mainWindow.webContents.session.on(
    'select-hid-device',
    (event, details, callback) => {
      event.preventDefault();
      if (details.deviceList && details.deviceList.length > 0) {
        callback(details.deviceList[0].deviceId);
      } else {
        callback();
      }
    },
  );

  // WebBluetooth device selection handler
  mainWindow.webContents.on(
    'select-bluetooth-device',
    (event, deviceList, callback) => {
      event.preventDefault();
      if (deviceList && deviceList.length > 0) {
        callback(deviceList[0].deviceId);
      } else {
        callback();
      }
    },
  );

  // Open links in external browser
  mainWindow.webContents.on('will-navigate', (event, newWindow) => {
    if (newWindow.startsWith('https:')) {
      event.preventDefault();
      require('electron').shell.openExternal(newWindow);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
