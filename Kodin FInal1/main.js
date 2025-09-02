const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');
const pty = require("@lydell/node-pty");




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




// function getToolsBasePath() {
//   if (process.env.NODE_ENV === 'development') {
//     return path.join(__dirname, 'resources', 'tools');
//   } else {
//     return path.join(process.resourcesPath, 'tools');
//   }
// }

// function getToolsBasePath() {
//   if (process.env.NODE_ENV === 'development') {
//     // In dev, tools are inside your project under resources/tools
//     return path.join(__dirname, 'resources', 'tools');
//   } else {
//     // In production, tools should be placed via electron-builder extraResources
//     // They will be outside app.asar, inside resources/tools
//     return path.join(process.resourcesPath, 'tools');
//   }
// }

// function resolveBundledTools() {
//   const toolsBase = getToolsBasePath();

//   const lookup = (relativePaths) => {
//     for (const rel of relativePaths) {
//       const absPath = path.join(toolsBase, rel);
//       if (fs.existsSync(absPath)) return absPath;
//     }
//     return null;
//   };

//   return {
//     python:  lookup(['python/python.exe', 'python/bin/python3', 'python3', 'python']),
//     gcc:     lookup(['tdm-gcc/bin/gcc.exe', 'mingw64/bin/gcc.exe', 'gcc/bin/gcc', 'bin/gcc']),
//     gpp:     lookup(['tdm-gcc/bin/g++.exe', 'mingw64/bin/g++.exe', 'gcc/bin/g++', 'bin/g++']),
//     javac:   lookup(['jdk/bin/javac.exe', 'jdk/bin/javac', 'bin/javac']),
//     java:    lookup(['jdk/bin/java.exe', 'jdk/bin/java', 'bin/java']),
//     sqlite3: lookup(['sqlite/sqlite3.exe', 'sqlite/sqlite3', 'bin/sqlite3']),
//   };
// }

// function extendPathForTool(cmdPath) {
//   if (!cmdPath) return process.env.PATH;
//   const toolDir = path.dirname(cmdPath);
//   // Also add parent folder for safety (some tools have bin + libexec)
//   return `${toolDir}${path.delimiter}${path.dirname(toolDir)}${path.delimiter}${process.env.PATH}`;
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
 
  
  // let pipPath = null;
  // if (pythonPath) {
  //   const scriptsPath = path.join(path.dirname(pythonPath), 'Scripts', 'pip.exe');
  //   pipPath = fs.existsSync(scriptsPath) ? scriptsPath : `"${pythonPath}" -m pip`;
  // }
  const pipPath = pythonPath ? `"${pythonPath}" -m pip` : null;

  return {
    python: pythonPath,
    pip: pipPath,
    gcc:     lookup(['tdm-gcc/bin/gcc.exe', 'mingw64/bin/gcc.exe', 'gcc/bin/gcc', 'bin/gcc']),
    gpp:     lookup(['tdm-gcc/bin/g++.exe', 'mingw64/bin/g++.exe', 'gcc/bin/g++', 'bin/g++']),
    javac:   lookup(['jdk/bin/javac.exe', 'jdk/bin/javac', 'bin/javac']),
    java:    lookup(['jdk/bin/java.exe', 'jdk/bin/java', 'bin/java']),
    sqlite3: lookup(['sqlite/sqlite3.exe', 'sqlite/sqlite3', 'bin/sqlite3']),
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


ipcMain.handle('run-command-stream', async (_, { cmd, args = [], filePath = null }) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    // Ensure cwd is always a valid string
    const cwd = (filePath && typeof filePath === 'string')
      ? path.dirname(filePath)
      : process.cwd();

    // ✅ Wrap cmd in quotes if on Windows to handle spaces in paths (like Program Files)
    const quotedCmd = process.platform === 'win32' ? `"${cmd}"` : cmd;

    // ✅ Spawn with shell:true so quoted paths work correctly
    const proc = spawn(quotedCmd, args, {
      cwd,
      windowsHide: true,
      shell: true,
      env: {
        ...process.env,
        PATH: extendPathForTool(cmd) // your PATH extension logic
      }
    });

    // Stream stdout
    proc.stdout.on('data', (chunk) => {
      const txt = chunk.toString();
      stdout += txt;
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('run-output', { type: 'stdout', text: txt });
      }
    });

    // Stream stderr
    proc.stderr.on('data', (chunk) => {
      const txt = chunk.toString();
      stderr += txt;
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('run-output', { type: 'stderr', text: txt });
      }
    });

    proc.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message });
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    // Kill after 12s timeout to avoid hanging
    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
    }, 12000);

    proc.on('close', () => clearTimeout(timer));
  });
});


// ipcMain.handle("run-sql-stream", async (_event, { cmd, args, sqlFile }) => {
//   return new Promise((resolve) => {
//     const proc = spawn(cmd, args, {
//       cwd: process.cwd(),
//       windowsHide: true,
//       shell: true,
//       env: {
//         ...process.env,
//         PATH: extendPathForTool(cmd),
//       },
//     });

//     let stdout = "";
//     let stderr = "";

//     proc.stdout.on("data", (chunk) => {
//       stdout += chunk.toString();
//     });

//     proc.stderr.on("data", (chunk) => {
//       stderr += chunk.toString();
//     });

//     proc.on("close", (code) => {
//       resolve({ stdout, stderr, code });
//     });

//     // ✅ Pipe .sql file contents into sqlite3 stdin
//     const fs = require("fs");
//     fs.createReadStream(sqlFile).pipe(proc.stdin);
//   });
// });

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
let outputListener = null;
const homeDir = path.join(os.homedir(), "Desktop");

//-------------------------------------------
// Create a new shell
//-------------------------------------------
// function createShell() {
//   if (process.platform === "win32") {
//     shell = pty.spawn("cmd.exe", [], {
//       name: "xterm-color",
//       cwd: homeDir,
//       env: process.env,
//     });
//   } else {
//     shell = pty.spawn("bash", ["--noprofile", "--norc"], {
//       name: "xterm-color",
//       cwd: homeDir,
//       env: process.env,
//     });
//   }
// }

// function createShell() {
//   const tools = resolveBundledTools(); // get python/java/etc. paths
//   const pythonPath = tools.python;
//   const toolBin = path.dirname(pythonPath);

//   const newEnv = {
//     ...process.env,
//     PATH: `${toolBin}${path.delimiter}${process.env.PATH}`,
//   };

//   if (process.platform === "win32") {
//     shell = pty.spawn("cmd.exe", [], {
//       name: "xterm-color",
//       cwd: homeDir,
//       env: newEnv,
//     });
//   } else {
//     shell = pty.spawn("bash", ["--noprofile", "--norc"], {
//       name: "xterm-color",
//       cwd: homeDir,
//       env: newEnv,
//     });
//   }
// }



// function createShell() {
//   const tools = resolveBundledTools(); // get python/java/etc.
//   const pythonPath = tools.python;
//   if (!pythonPath) {
//     console.error("Bundled Python not found!");
//     return;
//   }

//   const pythonDir = path.dirname(pythonPath);
//   const scriptsDir = path.join(pythonDir, "Scripts"); // pip.exe location

//   const newEnv = {
//     ...process.env,
//     // Prepend Scripts and Python dir so python & pip point to bundled ones
//     PATH: `${scriptsDir}${path.delimiter}${pythonDir}${path.delimiter}${process.env.PATH}`,
//   };

//   if (process.platform === "win32") {
//     shell = pty.spawn("cmd.exe", [], {
//       name: "xterm-color",
//       cwd: homeDir,
//       env: newEnv,
//     });
//   } else {
//     shell = pty.spawn("bash", ["--noprofile", "--norc"], {
//       name: "xterm-color",
//       cwd: homeDir,
//       env: newEnv,
//     });
//   }
//   }

//-------------------------------------------
function createShell() {
  const tools = resolveBundledTools(); // get python/java/etc.
  const pythonPath = tools.python;
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    console.error("Bundled Python not found!");
    return;
  }

  const pythonDir = path.dirname(pythonPath);
  const scriptsDir = path.join(pythonDir, "Scripts"); // pip.exe location

  const newEnv = {
    ...process.env,
    // Prepend Scripts and Python dir so python & pip point to bundled ones
    PATH: `${scriptsDir}${path.delimiter}${pythonDir}${path.delimiter}${process.env.PATH}`,
  };

  if (process.platform === "win32") {
    shell = pty.spawn("cmd.exe", [], {
      name: "xterm-color",
      cwd: homeDir,
      env: newEnv,
    });
  } else {
    shell = pty.spawn("bash", ["--noprofile", "--norc"], {
      name: "xterm-color",
      cwd: homeDir,
      env: newEnv,
    });
  }

  
  
}


//-------------------------------------------
// IPC listeners (registered once)
//-------------------------------------------ssssss
// ipcMain.on("terminal-input", (event, data) => {
//   if (!shell) return;

//   const tools = resolveBundledTools();
//   const pythonPath = tools.python;

//   // Always use python -m pip
//   const fixedData = data
//     .replace(/\bpython\b/g, `"${pythonPath}"`)
//     .replace(/\bpip\b/g, `"${pythonPath}" -m pip`);

  // console.log("fixeddata:", fixedData);

//   shell.write(fixedData);
// });

// let inputBuffer = "";

// ipcMain.on("terminal-input", (event, data) => {
//   if (!shell) return;

//   // Echo every character immediately
//   shell.write(data);

//   // Buffer input for command replacement
//   inputBuffer += data;

//   // Check if Enter pressed
//   if (data.includes("\r") || data.includes("\n")) {
//     let lineToExecute = inputBuffer;
//     inputBuffer = ""; // reset buffer

//     // Only replace if python or pip is in the command
//     if (/\bpython\b|\bpip\b/.test(lineToExecute)) {
//       const tools = resolveBundledTools();
//       const pythonPath = tools.python;
//       const pipPath = path.join(path.dirname(pythonPath), "Scripts", "pip.exe");

//       lineToExecute = lineToExecute
//         .replace(/\bpython\b/g, `"${pythonPath}"`)
//         .replace(/\bpip\b/g, `"${pipPath}"`);
      
//     }
//     console.log("linetoexecute:",lineToExecute)
//     // Execute in the same PTY
//     shell.write(`\r${lineToExecute}\r\n`);
//   }
// });

let inputBuffer = "";

ipcMain.on("terminal-input", (event, data) => {
  if (!shell) return;

  shell.write(data);
  inputBuffer += data;

  if (data.includes("\r") || data.includes("\n")) {
    let lineToExecute = inputBuffer.trim();
    inputBuffer = "";

    if (/\bpython\b|\bpip\b/.test(lineToExecute)) {
      const tools = resolveBundledTools();

      if (tools.python) {
    lineToExecute = lineToExecute.replace(/\bpython\b/g, `"${tools.python}"`);
    }

    if (tools.pip) {
    // Always replace pip with "python -m pip"
    lineToExecute = lineToExecute.replace(/\bpip\b/g, tools.pip);
    }
    }

    console.log("Executing:", lineToExecute);
    shell.write(`\r${lineToExecute}\r\n`);
  }
});




ipcMain.on("terminal-subscribe-output", (event) => {
  if (!shell) return;

  // Remove previous listener to avoid double echo
  if (outputListener) shell.removeListener("data", outputListener);

  outputListener = (data) => {
    event.sender.send("terminal-output", data);
  };

  shell.on("data", outputListener);
});

ipcMain.on("terminal-resize", (event, { cols, rows }) => {
  if (shell) {
    try {
      shell.resize(cols, rows);
    } catch (err) {
      console.error("Error resizing shell:", err);
    }
  }
});

//-------------------------------------------
// Login - creates new shell
//-------------------------------------------
ipcMain.handle("terminal-login", async (event) => {
  try {
    // Kill previous shell if exists
    if (shell) {
      shell.kill();
      shell = null;
    }

    createShell();
    return { success: true };
  } catch (err) {
    console.error("Error creating shell:", err);
    return { success: false, error: err.message };
  }
});

//-------------------------------------------
// Logout - kills shell
//-------------------------------------------
ipcMain.handle("terminal-logout", async () => {
  try {
    if (shell) {
      shell.kill();
      shell = null;
      outputListener = null;
    }
    return { success: true };
  } catch (err) {
    console.error("Error killing shell:", err);
    return { success: false, error: err.message };
  }
});

//-------------------------------------------
// Print prompt
//-------------------------------------------
ipcMain.handle("terminal-print-prompt", () => {
  let promptText = "";
  if (process.platform === "win32") {
    promptText = `${homeDir}>`;
  } else {
    promptText = `${process.env.USER || "user"}@${os.hostname()}:${homeDir}$ `;
  }
  if (shell) shell.write(promptText);
  return promptText;
});

//-------------------------------------------
// Get home dir
//-------------------------------------------
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
