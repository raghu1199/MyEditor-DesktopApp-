const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { spawn } = require('child_process');
const os = require('os');


const fsp = require('fs/promises');



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

ipcMain.handle('run-command', async (_, command) => {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        reject(stderr || err.message);
      } else {
        resolve(stdout);
      }
    });
  });
});

ipcMain.handle('save-temp-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog({
    title: 'Save File',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  // Create an empty file at that path
  fs.writeFileSync(result.filePath, '');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('join-path', (event, folder, file) => {
  return path.join(folder, file);
});





const getExportExecutablePath = () => {
  return isDev
    ? path.join(__dirname, 'scripts', 'export_report.exe')
    : path.join(process.resourcesPath, 'scripts', 'export_report.exe');
};

ipcMain.handle('export-report', async (event, args) => {
  const { openedFiles, currentUser, currentFolder,outputs } = args;
  const exePath = getExportExecutablePath();

  return new Promise((resolve, reject) => {
    const py = spawn(exePath, [
      JSON.stringify(openedFiles),
      currentUser,
      currentFolder || '',
      outputs
    ]);

    let output = '';
    let errorOutput = '';

    py.stdout.on('data', data => (output += data.toString()));
    py.stderr.on('data', data => (errorOutput += data.toString()));

    py.on('close', code => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        reject({ success: false, error: errorOutput });
      }
    });
  });
});


// main/buildTree.js


function buildTree(folderPath) {
  const walk = (dir) => {
    return fs.readdirSync(dir).map(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return {
          name: item,
          path: fullPath,
          type: 'folder',
          children: walk(fullPath)
        };
      } else {
        return {
          name: item,
          path: fullPath,
          type: 'file'
        };
      }
    });
  };

  return [{
    name: path.basename(folderPath),
    path: folderPath,
    type: 'folder',
    children: walk(folderPath)
  }];
}

module.exports = { buildTree };



ipcMain.handle('get-folder-tree', async (event, folderPath) => {
  return buildTree(folderPath); // same method you use in openFolder
});



// const fs = require('fs/promises');
// const fsSync = require('fs');

ipcMain.handle('rename-file-or-folder', async (event, oldPath, newPath) => {
  try {
    await fsp.rename(oldPath, newPath);
    return true;
  } catch (err) {
    console.error("Rename error:", err);
    return false;
  }
});

ipcMain.handle('file-exists', async (event, path) => {
  return fs.existsSync(path);
});

ipcMain.handle('getDirName', async (event, fullPath) => {
  try {
    return path.dirname(fullPath);
  } catch (err) {
    console.error('Error getting dirname:', err);
    return null;
  }
});

ipcMain.handle('write-output-temp', async (_event, outputText) => {
  const tempDir = os.tmpdir();
  const fileName = `kodin_output_${Date.now()}.txt`;
  const fullPath = path.join(tempDir, fileName);

  fs.writeFileSync(fullPath, outputText, 'utf-8');
  return fullPath;
});


ipcMain.handle('save-question-files', async (event, { questionText }) => {
  try {
    const desktopDir = path.join(os.homedir(), 'Desktop');
    const kodinBase = path.join(desktopDir, 'Kodin');

    // Create ~/Desktop/Kodin if it doesn't exist
    if (!fs.existsSync(kodinBase)) {
      fs.mkdirSync(kodinBase);
    }

    const questionBase = path.join(kodinBase, 'Questions');

    // Create ~/Desktop/Kodin/Questions if it doesn't exist
    if (!fs.existsSync(questionBase)) {
      fs.mkdirSync(questionBase);
    }

    // Create a timestamped folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `Question_${timestamp}`;
    const fullPath = path.join(questionBase, folderName);
    fs.mkdirSync(fullPath);

    // Write files
    const qPath = path.join(fullPath, 'question.txt');
    fs.writeFileSync(qPath, questionText);

    const aPath = path.join(fullPath, 'algorithm.txt');
    fs.writeFileSync(aPath, '');

    return fullPath;
  } catch (err) {
    console.error('Error saving question files:', err);
    return null;
  }
});

ipcMain.handle("create-file-in-folder", async (event, { folderPath, fileName }) => {
  const fullPath = path.join(folderPath, fileName);
  try {
    fs.writeFileSync(fullPath, ""); // create empty file
    return fullPath;
  } catch (err) {
    console.error("Failed to create file:", err);
    return null;
  }
});

ipcMain.handle("create-folder-in-folder", async (event, { parentPath, folderName }) => {
  const fullPath = path.join(parentPath, folderName);
  try {
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath);
    }
    return fullPath;
  } catch (err) {
    console.error("Failed to create folder:", err);
    return null;
  }
});



