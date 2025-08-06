const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  if (canceled) return { canceled: true };
  const content = await fsp.readFile(filePaths[0], 'utf-8');
  return { canceled: false, filePath: filePaths[0], content };
});

ipcMain.handle('dialog:saveFile', async (_, { filePath, content }) => {
  if (!filePath) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog({
      title: 'Save File',
      defaultPath: 'untitled.txt'
    });
    if (canceled) return { canceled: true };
    filePath = newPath;
  }
  await fsp.writeFile(filePath, content, 'utf-8');
  return { canceled: false, filePath };
});

ipcMain.handle('save-file', async (_, filePath, content) => {
  try {
    await fsp.writeFile(filePath, content, 'utf-8');
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
    await fsp.writeFile(result.filePath, content, 'utf-8');
    return { filePath: result.filePath };
  } catch (err) {
    console.error('Error saving file:', err);
    return { canceled: true };
  }
});

async function readFolderRecursive(dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });

  const result = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await readFolderRecursive(fullPath); // recursion is async
      result.push({
        type: 'folder',
        name: entry.name,
        path: fullPath,
        children
      });
    } else {
      result.push({
        type: 'file',
        name: entry.name,
        path: fullPath
      });
    }
  }

  return result;
}



async function buildFolderTree(folderPath) {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true });

  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      const children = await buildFolderTree(fullPath);
      result.push({ type: 'folder', name: entry.name, path: fullPath, children });
    } else {
      result.push({ type: 'file', name: entry.name, path: fullPath });
    }
  }

  return result;
}


ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (canceled) return { canceled: true };

  const folderPath = filePaths[0];
  const tree = await buildFolderTree(folderPath); // ✅ No circular refs, just plain JSON

  return {
    canceled: false,
    folderPath,
    tree
  };
});

ipcMain.handle('readFile', async (_, filePath) => {
  return await fsp.readFile(filePath, 'utf-8');
});

ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  switch (action) {
    case 'minimize': win.minimize(); break;
    case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
  }
});

ipcMain.handle('run-command', async (_, command) => {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout);
    });
  });
});

ipcMain.handle('save-temp-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog({
    title: 'Save File',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return { canceled: true };
  await fs.writeFile(result.filePath, '');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('join-path', (_, folder, file) => {
  return path.join(folder, file);
});

const getExportExecutablePath = () => {
  return isDev
    ? path.join(__dirname, 'scripts', 'export_report.exe')
    : path.join(process.resourcesPath, 'scripts', 'export_report.exe');
};


ipcMain.handle('export-report', async (event, args) => {
  const { openedFiles, currentUser, currentFolder, outputs } = args;
  const exePath = getExportExecutablePath();

  return new Promise((resolve, reject) => {
    const py = spawn(exePath, [
      JSON.stringify(openedFiles),
      currentUser,
      currentFolder || '',
      outputs || ''
    ]);

    let output = '', errorOutput = '';
    py.stdout.on('data', data => (output += data.toString()));
    py.stderr.on('data', data => (errorOutput += data.toString()));

    py.on('close', async code => {
      if (code === 0) {
        console.log("📦 Python output:", output);

        // More forgiving regex and trim
        const match = output.match(/Report exported to\s+(.+\.pdf)/i);
        if (match && match[1]) {
          const raw = match[1].replace(/[\r\n]+/g, '').trim();
          const fullPath = path.isAbsolute(raw) ? raw : path.join(currentFolder, raw);
          console.log("📄 Detected PDF path:", fullPath);

          try {
            const exists = await fsp.access(fullPath).then(() => true).catch(() => false);
            resolve({ success: true, path: exists ? fullPath : null });
          } catch (err) {
            console.error("❌ Access error:", err);
            resolve({ success: true, path: null });
          }
        } else {
          console.error("❌ No match for PDF file in output");
          resolve({ success: true, path: null });
        }
      } else {
        console.error("❌ Python process error:", errorOutput);
        reject({ success: false, error: errorOutput });
      }
    });
  });
});


// function buildTree(folderPath) {
//   const walk = (dir) => {
//     return fsSync.readdirSync(dir).map(item => {
//       const fullPath = path.join(dir, item);
//       const stat = fsSync.statSync(fullPath);
//       if (stat.isDirectory()) {
//         return {
//           name: item,
//           path: fullPath,
//           type: 'folder',
//           children: walk(fullPath)
//         };
//       } else {
//         return {
//           name: item,
//           path: fullPath,
//           type: 'file'
//         };
//       }
//     });
//   };

//   return [{
//     name: path.basename(folderPath),
//     path: folderPath,
//     type: 'folder',
//     children: walk(folderPath)
//   }];
// }

// ipcMain.handle('get-folder-tree', async (event, folderPath) => {
//   return buildTree(folderPath);
// });

// in main.js

ipcMain.handle('get-folder-tree', async (_, folderPath) => {
  return await buildTreeAsync(folderPath);
});

async function buildTreeAsync(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const children = await buildTreeAsync(fullPath);
      result.push({ name: entry.name, path: fullPath, type: 'folder', children });
    } else {
      result.push({ name: entry.name, path: fullPath, type: 'file' });
    }
  }
  return result;
}

ipcMain.handle('rename-file-or-folder', async (_, oldPath, newPath) => {
  try {
    await fsp.rename(oldPath, newPath); // ✅ using fsp
    return true;
  } catch (err) {
    console.error("Rename error:", err);
    return false;
  }
});

ipcMain.handle('file-exists', async (_, pathToCheck) => {
  try {
    await fsp.access(pathToCheck); // ✅ using fsp
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('getDirName', async (_, fullPath) => {
  try {
    return path.dirname(fullPath); // no fs usage, this is fine
  } catch (err) {
    console.error('Error getting dirname:', err);
    return null;
  }
});

ipcMain.handle('write-output-temp', async (_, outputText) => {
  try {
    const tempDir = os.tmpdir();
    const fileName = `kodin_output_${Date.now()}.txt`;
    const fullPath = path.join(tempDir, fileName);
    await fsp.writeFile(fullPath, outputText, 'utf-8'); // ✅ using fsp
    return fullPath;
  } catch (err) {
    console.error('Error writing output temp file:', err);
    return null;
  }
});


ipcMain.handle('save-question-files', async (_, { questionText }) => {
  try {
    const baseDir = path.join(os.homedir(), 'Desktop', 'Kodin', 'Questions');
    await fsp.mkdir(baseDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fullPath = path.join(baseDir, `Question_${timestamp}`);
    await fsp.mkdir(fullPath, { recursive: true });

    await fsp.writeFile(path.join(fullPath, 'question.txt'), questionText, 'utf-8');
    await fsp.writeFile(path.join(fullPath, 'algorithm.txt'), '', 'utf-8');

    console.log("✅ Question folder created:", fullPath);
    return fullPath;
  } catch (err) {
    console.error('❌ Error saving question files:', err);
    return null;
  }
});

ipcMain.handle('create-file-in-folder', async (_, { folderPath, fileName }) => {
  try {
    const filePath = path.join(folderPath, fileName);
    await fsp.writeFile(filePath, '', 'utf-8');  // empty file
    return { success: true, filePath };
  } catch (error) {
    console.error("Failed to create file:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-folder-in-folder', async (_, { folderPath, folderName }) => {
  try {
    const fullPath = path.join(folderPath, folderName);
    await fsp.mkdir(fullPath, { recursive: true });
    return { success: true, folderPath: fullPath };
  } catch (error) {
    console.error("Failed to create folder:", error);
    return { success: false, error: error.message };
  }
});


ipcMain.handle('read-file-as-blob', async (_, filePath) => {
  try {
    return await fsp.readFile(filePath);
  } catch (err) {
    console.error("Error reading file as blob:", err);
    return null;
  }
});
