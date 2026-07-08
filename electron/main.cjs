const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  // 開発環境かパッケージングされているかを判定
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, '../public/icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#0a0e1a',
  });

  // メニューバーを非表示 (Windows/Linux)
  mainWindow.removeMenu();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`file://${path.join(__dirname, '../dist/index.html')}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
