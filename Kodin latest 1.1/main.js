const { app, BrowserWindow, ipcMain, dialog,protocol } = require('electron');
const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');
const pty = require("@lydell/node-pty");




let mainWindow;
const isDev = process.env.NODE_ENV === 'development';
const tempFiles = [];

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // 🔹 allow iframe to load app:// URLs
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

    registerPdfProtocol(mainWindow.webContents.session);
}



protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


function registerPdfProtocol(ses) {
  ses.protocol.registerBufferProtocol("app", (request, callback) => {
    const urlPath = request.url.replace("app://pdfs/", "");

    let basePath;
    if (process.env.NODE_ENV === "development") {
      basePath = path.join(__dirname, "resources", "pdfs");
    } else {
      basePath = path.join(process.resourcesPath, "pdfs");
    }

    const filePath = path.join(basePath, urlPath);

    try {
      const data = fs.readFileSync(filePath);
      callback({ mimeType: "application/pdf", data });
    } catch (err) {
      console.error("PDF read error:", err);
      callback({ statusCode: 404 });
    }
  });
}

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

ipcMain.handle("resolve-tutorial-pdf", (event, fileName) => {
  return `app://pdfs/${fileName}`;
});



// function getToolsBasePath() {
//   if (process.env.NODE_ENV === 'development') {
//     return path.join(__dirname, 'resources', 'tools');
//   } else {
//     return path.join(process.resourcesPath, 'tools');
//   }
// }





function getToolsBasePath() {
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, 'resources', 'tools');
  } else {
    return path.join(process.resourcesPath, 'tools');
  }
}

function resolveBundledTools() {
  const toolsBase = getToolsBasePath();

  const lookup = (relativePaths) => {
    for (const rel of relativePaths) {
      const absPath = path.join(toolsBase, rel);
      if (fs.existsSync(absPath)) return absPath;
    }
    return null;
  };

  const pythonPath = lookup(['python/python.exe', 'python/bin/python3', 'python3', 'python']);
 
  
  
  const pipPath = pythonPath ? `"${pythonPath}" -m pip` : null;

  return {
    python: pythonPath,
    pip: pipPath,
    gcc:     lookup(['tdm-gcc/bin/gcc.exe', 'mingw64/bin/gcc.exe', 'gcc/bin/gcc', 'bin/gcc']),
    gpp:     lookup(['tdm-gcc/bin/g++.exe', 'mingw64/bin/g++.exe', 'gcc/bin/g++', 'bin/g++']),
    javac:   lookup(['jdk/bin/javac.exe', 'jdk/bin/javac', 'bin/javac']),
    java:    lookup(['jdk/bin/java.exe', 'jdk/bin/java', 'bin/java']),
    sqlite3: lookup(['sqlite/sqlite3.exe', 'sqlite/sqlite3', 'bin/sqlite3']),
    tcc:     lookup(['tcc/tcc.exe', 'tcc/bin/tcc', 'bin/tcc']),
  };
}

function extendPathForTool(cmdPath) {
  if (!cmdPath) return process.env.PATH;
  const toolDir = path.dirname(cmdPath);
  return `${toolDir}${path.delimiter}${path.dirname(toolDir)}${path.delimiter}${process.env.PATH}`;
}


ipcMain.handle('get-bundled-tools-paths', async () => {
  return resolveBundledTools();
});

ipcMain.handle('run-command', async (_, { cmd, args = [] }) => {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      windowsHide: true,
      shell:true,
      env: {
        ...process.env,
        PATH: extendPathForTool(cmd)
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));

    setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} }, 8000);
  });
});



ipcMain.handle('run-sql-stream', async (_event, { cmd, args = [], sqlFile }) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    // ✅ Wrap executable path for Windows to handle spaces
    const quotedCmd = process.platform === 'win32' ? `"${cmd}"` :  cmd;

    const proc = spawn(quotedCmd, args, {
      cwd: process.cwd(),
      windowsHide: true,
      shell: true,
      env: {
        ...process.env,
        PATH: extendPathForTool(cmd)
      }
    });

    // Capture stdout
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    // Capture stderr
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    // ✅ Handle errors
    proc.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message });
    });

    // ✅ Handle close
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    // ✅ Pipe SQL file into stdin
    fs.createReadStream(sqlFile).pipe(proc.stdin);

    // ✅ Timeout after 12 seconds to avoid hanging
    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
    }, 12000);
    proc.on('close', () => clearTimeout(timer));
  });
});



// In main process
ipcMain.handle('getPlatformExt', () => {
  return process.platform === 'win32' ? '.exe' : '.out';
});

ipcMain.handle("path:getDirName", (event, filePath) => {
  return path.dirname(filePath);
});






ipcMain.handle('save-temp-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog({
    title: 'Save File',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return { canceled: true };
  await fs.promises.writeFile(result.filePath, '');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('join-path', (_, folder, file) => {
  return path.join(folder, file);
});

// const getExportExecutablePath = () => {
//   return isDev
//     ? path.join(__dirname, 'scripts', 'export_report.exe')
//     : path.join(process.resourcesPath, 'scripts', 'export_report.exe');
// };



const getExportExecutablePath = () => {
  return isDev
    ? path.join(__dirname, 'scripts', 'export_report.exe')  // dev
    : path.join(process.resourcesPath, 'export_report.exe');           // prod
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

ipcMain.handle("run-commandt", async (event, { command, cwd }) => {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, shell: true }, (error, stdout, stderr) => {
      if (error) {
        resolve(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
});



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

// ipcMain.handle('write-output-temp', async (_, outputText) => {
//   try {
//     const tempDir = os.tmpdir();
//     const fileName = `kodin_output_${Date.now()}.txt`;
//     const fullPath = path.join(tempDir, fileName);
//     await fsp.writeFile(fullPath, outputText, 'utf-8'); // ✅ using fsp
//     tempFiles.push(fullPath); 
//     return fullPath;
//   } catch (err) {
//     console.error('Error writing output temp file:', err);
//     return null;
//   }
// });

ipcMain.handle('write-output-temp', async (_, outputText) => {
  try {
    const tempDir = os.tmpdir();

    // ✅ Use fixed name instead of timestamp
    const fileName = "kodin_output.txt";
    const fullPath = path.join(tempDir, fileName);

    // ✅ Delete old file if it exists
    try {
      await fsp.unlink(fullPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('Failed to delete old output file:', err);
      }
    }

    // ✅ Write fresh output
    await fsp.writeFile(fullPath, outputText, 'utf-8');

    // ✅ Track file for cleanup on quit (avoid duplicates)
    if (!tempFiles.includes(fullPath)) {
      tempFiles.push(fullPath);
    }

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

    const fullPath = path.join(baseDir, 'Question');

    // 🔹 If folder exists, remove it completely
    try {
      await fsp.rm(fullPath, { recursive: true, force: true });
    } catch (err) {
      console.warn("⚠️ Failed to remove old Question folder (maybe it didn't exist):", err);
    }

    // 🔹 Now create a fresh folder
    await fsp.mkdir(fullPath, { recursive: true });

    // 🔹 Write files
    await fsp.writeFile(path.join(fullPath, 'question.txt'), questionText, 'utf-8');
    await fsp.writeFile(path.join(fullPath, 'algorithm.txt'), '', 'utf-8');

    console.log("✅ Fresh Question folder created:", fullPath);
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






let shell = null;

let currentMode = "idle"; // "idle" | "shell" | "program"


const interactiveProcesses = new Map();

// ✅ Normalization function
function normalizeOutput(data) {
  let cleaned = data.toString();

  // Remove ANSI escape sequences (colors, cursor control)
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  // Convert any \r not followed by \n into proper \r\n
  cleaned = cleaned.replace(/\r(?!\n)/g, '\r\n');

  // Ensure all \n are \r\n for Windows terminal alignment
  cleaned = cleaned.replace(/\n/g, '\r\n');

  return cleaned;
}



ipcMain.on('sendInteractiveInput', (event, pid, data) => {
  const item = interactiveProcesses.get(pid);
  if (item) item.process.write(data);
});

// ✅ Normal command execution (for compilation)
ipcMain.handle('runCommand', async (event, cmd, args = [], filePath = null) => {
  return new Promise((resolve) => {
    const cwd = filePath ? path.dirname(filePath) : process.cwd();
    const child = spawn(cmd, args, { cwd, shell: true });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += normalizeOutput(data);
    });

    child.stderr.on('data', (data) => {
      stderr += normalizeOutput(data);
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
});





ipcMain.handle("get-home-dir", () => {
  return os.homedir();
});


ipcMain.handle("read-file", async (_, filePath) => {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return data;
  } catch (err) {
    console.error("Error reading file:", err);
    throw err;
  }
});

ipcMain.handle("delete-file", async (_, filePath) => {
  fs.rmSync(filePath, { recursive: true, force: true }); // works for files & folders
  return true;
});

ipcMain.handle("rename-file", async (_, { filePath, newName }) => {
  const dir = path.dirname(filePath);
  const newPath = path.join(dir, newName);
  fs.renameSync(filePath, newPath);
  return newPath;
});




ipcMain.handle('ensure-dir', async (_, dirPath) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true, path: dirPath };
  } catch (err) {
    console.error("Error creating directory:", err);
    return { success: false, error: err.message };
  }
});



 
ipcMain.on('terminal:write', (event, command) => {
  if (shell) {
    shell.write(command);
  }
});

ipcMain.handle('get-platform', async () => {
  return process.platform; // 'win32', 'darwin', 'linux'
});


// ipcMain.handle('path:getTempExePath', (_event, { fileName, ext }) => {
//   const tempDir = os.tmpdir();

//   // Remove directories from fileName and forbidden chars
//   const baseName = path.basename(fileName, path.extname(fileName))
//                      .replace(/[<>:"/\\|?*]/g, ''); // sanitize

//   const timestamp = Date.now(); // avoid collisions
//   return path.join(tempDir, `${baseName}-${timestamp}${ext}`);
// });

ipcMain.handle('path:getTempExePath', async (_event, { fileName, ext }) => {
  const tempDir = os.tmpdir();

  const baseName = path.basename(fileName, path.extname(fileName))
                   .replace(/[<>:"/\\|?*]/g, '');

  const exePath = path.join(tempDir, `${baseName}${ext}`);

  try {
    await fsp.unlink(exePath); // remove old file if it exists
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to delete old exe:', err);
    }
  }

  return exePath;
});


// // openShell
// ipcMain.handle("openShell", async (event) => {
//   // kill program PTYs if any
//   if (currentMode === "program") {
//     for (const [pid, item] of interactiveProcesses.entries()) {
//       try { item.process.kill(); } catch (e) {}
//       interactiveProcesses.delete(pid);
//     }
//   }

//   if (shell) {
//     try { shell.kill(); } catch (e) {}
//     shell = null;
//   }

//   const platform = process.platform;
//   const cmd = platform === "win32" ? "cmd.exe" : "bash";
//   const args = platform === "win32" ? [] : ["-i"];

//   shell = pty.spawn(cmd, args, {
//     name: "xterm-color",
//     cwd: process.cwd(),
//     env: { ...process.env, TERM: "xterm-256color" },
//     cols: 120, rows: 40,
//   });

//   currentMode = "shell";
//   // notify renderer that mode changed
//   event.sender.send('mode-changed', currentMode);

//   shell.on("data", (data) => {
//     event.sender.send("shell-output", normalizeOutput(data));
//   });

//   return { success: true };
// });


function getDefaultShell() {
  const platform = process.platform;

  if (platform === "win32") {
    // 1. Use COMSPEC if defined
    if (process.env.comspec) return process.env.comspec;

    // 2. Otherwise, use Windows dir
    const winDir = process.env.windir || "C:\\Windows";
    return path.join(winDir, "System32", "cmd.exe");
  }

  // macOS/Linux: prefer user shell
  if (process.env.SHELL) return process.env.SHELL;

  // Fallbacks
  if (platform === "darwin") return "/bin/zsh"; // macOS default
  return "/bin/sh"; // Linux safe default
}

ipcMain.handle("openShell", async (event) => {
  // Kill program PTYs if any
  if (currentMode === "program") {
    for (const [pid, item] of interactiveProcesses.entries()) {
      try { item.process.kill(); } catch (e) {}
      interactiveProcesses.delete(pid);
    }
  }

  // Kill old shell if any
  if (shell) {
    try { shell.kill(); } catch (e) {}
    shell = null;
  }

  // Resolve shell + args
  const cmd = getDefaultShell();
  const args = process.platform === "win32" ? [] : ["-i"];

  try {
    shell = pty.spawn(cmd, args, {
      name: "xterm-color",
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: process.env.PATH,    // ✅ ensure PATH exists in packaged app
        TERM: "xterm-256color",
      },
      cols: 120,
      rows: 40,
    });
  } catch (err) {
    console.error("Failed to spawn shell:", cmd, err);
    event.sender.send("shell-output", `\r\n❌ Failed to start shell: ${err.message}\r\n`);
    return { success: false, error: err.message };
  }

  currentMode = "shell";
  event.sender.send("mode-changed", currentMode);

  shell.on("data", (data) => {
    event.sender.send("shell-output", normalizeOutput(data));
  });

  return { success: true };
});




// // helper to pick a safe default shell
// function getDefaultShell() {
//   const platform = process.platform;

//   if (platform === "win32") {
//     // Use COMSPEC if defined, fallback to cmd.exe
//     return process.env.comspec || "C:\\Windows\\System32\\cmd.exe";
//   }

//   // macOS/Linux: prefer user shell
//   if (process.env.SHELL) return process.env.SHELL;

//   // Fallbacks
//   if (platform === "darwin") return "/bin/zsh"; // macOS default
//   return "/bin/sh"; // Linux safe default
// }

// ipcMain.handle("openShell", async (event) => {
//   // kill program PTYs if any
//   if (currentMode === "program") {
//     for (const [pid, item] of interactiveProcesses.entries()) {
//       try { item.process.kill(); } catch (e) {}
//       interactiveProcesses.delete(pid);
//     }
//   }

//   // kill old shell if any
//   if (shell) {
//     try { shell.kill(); } catch (e) {}
//     shell = null;
//   }

//   // resolve shell + args
//   const cmd = getDefaultShell();
//   const args = process.platform === "win32" ? [] : ["-i"];

//   try {
//     shell = pty.spawn(cmd, args, {
//       name: "xterm-color",
//       cwd: process.cwd(),
//       env: {
//         ...process.env,             // ✅ keep PATH and other env vars
//         TERM: "xterm-256color",
//       },
//       cols: 120,
//       rows: 40,
//     });
//   } catch (err) {
//     console.error("Failed to spawn shell:", err);
//     return { success: false, error: err.message };
//   }

//   currentMode = "shell";
//   event.sender.send("mode-changed", currentMode);

//   shell.on("data", (data) => {
//     event.sender.send("shell-output", normalizeOutput(data));
//   });

//   return { success: true };
// });


// startInteractiveProcess (auto-kill shell and notify renderer)
ipcMain.handle('startInteractiveProcess', async (event, cmd, args = [], filePath = null) => {
  // kill shell if running
  if (currentMode === "shell" && shell) {
    try { shell.kill(); } catch (e) {}
    shell = null;
  }

  const cwd = filePath ? path.dirname(filePath) : process.cwd();
  const p = pty.spawn(cmd, args, {
    name: 'xterm-color',
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
    cols: 120,
    rows: 40
  });

  currentMode = "program";
  // notify renderer
  event.sender.send('mode-changed', currentMode);

  const dataHolder = { process: p, output: '' };

  p.on('data', (data) => {
    const cleaned = normalizeOutput(data);
    dataHolder.output += cleaned;
    event.sender.send('shell-output', cleaned);
  });

  const pid = p.pid;
  interactiveProcesses.set(pid, dataHolder);

  return { pid };
});

// finishInteractive
ipcMain.handle('finishInteractive', async (event, pid) => {
  const item = interactiveProcesses.get(pid);
  if (!item) return { output: '' };

  try { item.process.kill(); } catch (e) {}
  interactiveProcesses.delete(pid);

  if (interactiveProcesses.size === 0) {
    currentMode = "idle";
    event.sender.send('mode-changed', currentMode);
  }

  return { output: item.output };
});



let inputBuffer = "";

ipcMain.on("terminal-input", (event, data) => {
  if (!shell) return;

  // Buffer input
  inputBuffer += data;

  // Detect Enter
  if (data.includes("\r") || data.includes("\n")) {
    let lineToExecute = inputBuffer.trim();
    inputBuffer = "";

    // ✅ Replace python/pip with bundled ones
    if (/\bpython\b|\bpip\b/.test(lineToExecute)) {
      const tools = resolveBundledTools();
      if (tools.python) {
        lineToExecute = lineToExecute.replace(/\bpython\b/g, `"${tools.python}"`);
      }
      if (tools.pip) {
        lineToExecute = lineToExecute.replace(/\bpip\b/g, tools.pip);
      }

      data = `\r${lineToExecute}\r\n`; // inject replacement
    }
  }

  shell.write(data);
});

ipcMain.handle("resizeShell", (event, cols, rows) => {
  if (shell) shell.resize(cols, rows);
});

ipcMain.handle("closeShell", async () => {
  if (shell) {
    try { shell.kill(); } catch {}
    shell = null;
  }
  currentMode = "idle";
  return { success: true };

});
