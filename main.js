const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a reference to prevent GC
let mainWindow;

// Helper: check dev vs prod
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,              // ✅ removes default OS frame
    titleBarStyle: 'hidden',   // ✅ clean edge-to-edge content
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// ✅ App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ✅ IPC: Open file
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });

  if (canceled) return { canceled: true };

  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { canceled: false, filePath: filePaths[0], content };
});

// ✅ IPC: Save file
ipcMain.handle('dialog:saveFile', async (_, { filePath, content }) => {
  if (!filePath) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog({
      title: 'Save File',
      defaultPath: 'untitled.txt'
    });

    if (canceled) return { canceled: true };
    filePath = newPath;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return { canceled: false, filePath };
});


ipcMain.handle('save-file', async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving file:', err);
    return false;
  }
});

ipcMain.handle('file:saveAsFile', async (_, content) => {
  const result = await dialog.showSaveDialog({
    title: 'Save As',
    defaultPath: 'untitled.js',
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });

  if (result.canceled) return { canceled: true };

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { filePath: result.filePath };
  } catch (err) {
    console.error('Error saving file:', err);
    return { canceled: true };
  }
});


// ✅ IPC: Open folder


function readFolderRecursive(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map(entry => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return {
        type: 'folder',
        name: entry.name,
        path: fullPath,
        children: readFolderRecursive(fullPath)
      };
    } else {
      return {
        type: 'file',
        name: entry.name,
        path: fullPath
      };
    }
  });
}

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (canceled) return { canceled: true };

  const folderPath = filePaths[0];
  const tree = readFolderRecursive(folderPath);
  return { canceled: false, folderPath, tree };
});

ipcMain.handle('readFile', async (_, filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content;
});


// ✅ main.js
ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  switch (action) {
    case 'minimize':
      win.minimize();
      break;
    case 'maximize':
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      break;
    case 'close':
      win.close();
      break;
  }
});
