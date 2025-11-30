const { app, BrowserWindow, ipcMain, dialog,protocol,clipboard, Menu } = require('electron');


const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');
const pty = require("@lydell/node-pty");
const crypto = require("crypto");
const { execSync } = require("child_process");
const iohook = require('@tkomde/iohook');







// let mainWindow;
// const isDev = process.env.NODE_ENV === 'development';
// const tempFiles = [];

// protocol.registerSchemesAsPrivileged([
//   { scheme: "app", privileges: { secure: true, standard: true } }
// ]);


// function createWindow() {
//   mainWindow = new BrowserWindow({
//     width: 1200,
//     height: 800,
//     frame: false,
//     titleBarStyle: 'hidden',
//     webPreferences: {
//       preload: path.join(__dirname, 'preload.js'),

//       contextIsolation: true,
//       nodeIntegration: false,
//       webSecurity: false, // 🔹 allow iframe to load app:// URLs
//     }
//   });

//   if (isDev) {
//     mainWindow.loadURL('http://localhost:5173');
//     mainWindow.webContents.openDevTools();
//   } else {
//     mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
//   }

//     registerPdfProtocol(mainWindow.webContents.session);
// }


let mainWindow;
const isDev = process.env.NODE_ENV === "development";
const tempFiles = [];

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // 🔹 allow iframe to load app:// URLs
      devTools: isDev,    // 🚫 disable DevTools in production
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));

    // 🚫 remove menu in production (so no "Toggle DevTools")
    Menu.setApplicationMenu(null);

    // 🚫 block Ctrl+Shift+I & F12
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (
        (input.control && input.shift && input.key.toLowerCase() === "i") ||
        input.key.toLowerCase() === "f12"
      ) {
        event.preventDefault();
      }
    });

    // 🚫 block right-click → Inspect Element
    mainWindow.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });
  }

  registerPdfProtocol(mainWindow.webContents.session);
}


protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

 
let scanInterval = null;
let lastState = false;

const automationExtensions = [
  '.ahk', '.au3', '.rec', '.pmc', '.mex', '.sikuli', '.robot',
  '.flow', '.vbs', '.gsc', '.opac'
];

// ------------------------
// Helper functions
// ------------------------
function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((err && err.message) + (stderr ? ` -- ${stderr}` : '')));
      resolve(stdout);
    });
  });
}

function filterOutScannerProcesses(items) {
  if (!Array.isArray(items)) return [];
  const ignorePattern = /Get-CimInstance|ConvertTo-Json|ExecutionPolicy|powershell|cmd.exe|wmic/i;

  return items
    .map(it => ({ pid: Number(it.ProcessId || it.pid || 0), commandLine: String(it.CommandLine || '') }))
    .filter(i => i.pid)
    .filter(i => automationExtensions.some(ext => i.commandLine.toLowerCase().includes(ext)))
    .filter(i => !ignorePattern.test(i.commandLine));
}

// ------------------------
// Process listing
// ------------------------
async function listAutomationProcesses() {
  if (process.platform !== 'win32') return [];

  const psCmd = [
    'Get-CimInstance Win32_Process',
    "| Where-Object { $_.CommandLine -match '\\.ahk|\\.au3|\\.rec|\\.pmc|\\.mex|\\.sikuli|\\.robot|\\.flow|\\.vbs|\\.gsc|\\.opac|\\.txt' }",
    '| Select-Object ProcessId,CommandLine',
    '| ConvertTo-Json -Compress'
  ].join(' ');

  try {
    const stdout = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
    if (!stdout) return [];
    const parsed = JSON.parse(stdout);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return filterOutScannerProcesses(items);
  } catch (err) {
    return await listAutomationProcessesWMIC();
  }
}

function listAutomationProcessesWMIC() {
  return new Promise(resolve => {
    exec('wmic process get ProcessId,CommandLine /FORMAT:CSV', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const results = [];
      for (const line of lines) {
        if (/^Node,CommandLine,ProcessId/i.test(line)) continue;
        const parts = line.split(',');
        if (parts.length < 3) continue;
        const pid = parseInt(parts[parts.length - 1].trim(), 10);
        const cmd = parts.slice(1, parts.length - 1).join(',').trim();
        results.push({ ProcessId: pid, CommandLine: cmd });
      }
      resolve(filterOutScannerProcesses(results));
    });
  });
}


function startAutomationScanner(intervalMs = 3000) {
  console.log("inside automation scanner");
  if (scanInterval) return;

  (async () => {
    const running = await listAutomationProcesses();
    lastState = running.length > 0;
    if (lastState) mainWindow?.webContents.send('automation-detected', running);
    else mainWindow?.webContents.send('automation-clear');
  })();

  scanInterval = setInterval(async () => {
    try {
      const running = await listAutomationProcesses();
      const isRunning = running.length > 0;
      if (isRunning !== lastState) {
        lastState = isRunning;
        if (isRunning) mainWindow?.webContents.send('automation-detected', running);
        else mainWindow?.webContents.send('automation-clear');
      }
    } catch (e) {
      console.error('[AUTOMATION-SCANNER] scan error', e);
    }
  }, intervalMs);
}

function stopAutomationScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    lastState = false;
  }
}


// startAhkScriptScanner(3000); // scan every 3 seconds
startAutomationScanner(3000);







app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
  stopAutomationScanner();
});






// const SUSPICIOUS_KEYWORDS = [
//   "chatgpt", "gpt", "notepad++", "chrome", "firefox", "brave",
//   "pycharm", "code", "anaconda", "autoit", "ahk", "sikulix",
//   "uiautomation", "uipath", "automation", "copilot", "edge", "opera"
// ];

// const SAFE_KEYWORDS = [
//   "kodin", "electron", "explorer.exe", "cmd.exe", "powershell.exe",
//   "System", "Registry", "wininit", "winlogon", "svchost", "services"
// ];

// function isSuspiciousCmd(cmd) {
//   if (!cmd) return false;
//   const lower = cmd.toLowerCase();

//   // --- 0. EXCLUDE YOUR OWN APP AND ITS PYTHON SCRIPTS ---
//   if (
//     lower.includes("kodin") ||           // any kodin.exe or kodin.py
//     lower.includes("electron.exe") ||    // electron runtime
//     lower.includes("yourappname.exe")    // rename this to your real packaged exe
//   ) {
//     return false;
//   }

//   // --- 1. fast safe keyword check ---
//   if (SAFE_KEYWORDS.some(s => lower.includes(s))) return false;

//   // --- 2. suspicious word hits (chatgpt, vscode, chrome, etc.) ---
//   const keywordHit = SUSPICIOUS_KEYWORDS.some(k => lower.includes(k));

//   // --- 3. ANY .exe except safe + your own ---
//   const exeHit =
//     lower.endsWith(".exe") &&
//     !SAFE_KEYWORDS.some(s => lower.includes(s));

//   // --- 4. ANY .py script except kodin*.py ---
//   const pyHit =
//     lower.includes(".py") &&
//     !lower.includes("kodin"); // allows all kodin python tools

//   return keywordHit || exeHit || pyHit;
// }


// function parseWmicCsvOutput(stdout) {
//   if (!stdout) return [];
//   const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
//   const results = [];
//   for (const line of lines) {
//     // skip header
//     if (/^Node,CommandLine,ProcessId/i.test(line)) continue;
//     const parts = line.split(',');
//     if (parts.length < 3) continue;
//     const pid = parseInt(parts[parts.length - 1].trim(), 10);
//     const cmd = parts.slice(1, parts.length - 1).join(',').trim();
//     if (!pid || !cmd) continue;
//     results.push({ pid, commandLine: cmd });
//   }
//   return results;
// }

// function listProcessesWMIC() {
//   return new Promise(resolve => {
//     exec('wmic process get ProcessId,CommandLine /FORMAT:CSV', { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
//       if (err || !stdout) return resolve([]);
//       resolve(parseWmicCsvOutput(stdout));
//     });
//   });
// }

// // try powershell approach first (returns JSON), fallback to WMIC
// async function listSuspiciousProcesses() {
//   if (process.platform !== 'win32') return [];

//   const psCmd = [
//     'Get-CimInstance Win32_Process',
//     "| Where-Object { $_.CommandLine -ne $null }",
//     '| Select-Object ProcessId,CommandLine',
//     '| ConvertTo-Json -Compress'
//   ].join(' ');

//   try {
//     const { stdout } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
//     if (!stdout) return [];
//     const parsed = JSON.parse(stdout);
//     const items = Array.isArray(parsed) ? parsed : [parsed];
//     const mapped = items.map(it => ({ pid: Number(it.ProcessId || 0), commandLine: String(it.CommandLine || '') }));
//     return mapped.filter(it => isSuspiciousCmd(it.commandLine));
//   } catch (e) {
//     // fallback to WMIC parsing
//     const all = await listProcessesWMIC();
//     return all.filter(it => isSuspiciousCmd(it.commandLine));
//   }
// }


// // Expose via IPC
// ipcMain.handle('scan-suspicious-processes', async () => {
//   try {
//     const procs = await listSuspiciousProcesses();
//     // normalize
//     return procs.map(p => ({ pid: p.pid, commandLine: p.commandLine }));
//   } catch (e) {
//     console.error('scan-suspicious-processes error', e);
//     return [];
//   }
// });


// const SUSPICIOUS_KEYWORDS = [
//   "chatgpt", "gpt", "notepad++", "chrome", "firefox", "brave",
//   "pycharm", "code", "anaconda", "autoit", "ahk", "sikulix",
//   "uiautomation", "uipath", "automation", "copilot", "edge", "opera"
// ];

// const SAFE_KEYWORDS = [
//   "kodin",        // your app & python scripts
//   "electron",     // runtime
//   "explorer.exe",
//   "cmd.exe",
//   "powershell.exe",
//   "system",
//   "registry",
//   "wininit",
//   "winlogon",
//   "svchost"
// ];

// // ---------- robust suspicious-check ----------
// function isSuspiciousCmd(cmd) {
//   if (!cmd) return false;
//   const lower = cmd.toLowerCase();

//   // 0) Exclude very obvious own-app / safe markers (kodin and electron)
//   if (lower.includes("kodin")) return false;
//   if (lower.includes("electron")) return false;

//   // 1) Exclude common safe system processes early
//   for (const s of SAFE_KEYWORDS) {
//     if (lower.includes(s)) {
//       return false;
//     }
//   }

//   // 2) If it contains an executable (xxx.exe) that's not known-safe -> suspicious
//   // Use regex to catch exe anywhere and followed by space, quote or end
//   const exeRegex = /\.exe([ "\']|$)/i;
//   if (exeRegex.test(lower)) {
//     return true;
//   }

//   // 3) If it mentions a python interpreter + a script path (.py) that's NOT kodin -> suspicious
//   if (lower.includes(".py")) {
//     // allow kodin related python runs
//     if (!lower.includes("kodin")) return true;
//   }

//   // 4) keyword hit (vscode 'code' etc.)
//   for (const k of SUSPICIOUS_KEYWORDS) {
//     if (lower.includes(k)) return true;
//   }

//   // otherwise, not suspicious
//   return false;
// }

// // ---------- WMIC CSV parse (handles commas inside quotes better) ----------
// function parseWmicCsvOutput(stdout) {
//   if (!stdout) return [];
//   // Split lines and remove empty lines
//   const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
//   const results = [];

//   // Find header index to know column order - deliver a simple robust parser:
//   // Each line: Node,<commandLine>,<pid>
//   for (const line of lines) {
//     // skip header
//     if (/^Node,CommandLine,ProcessId/i.test(line)) continue;

//     // We can't reliably split by comma naively if command line contains commas.
//     // WMIC CSV usually formats as: Node,<CommandLine>,<ProcessId>
//     // We'll extract PID as last comma-separated token, and commandLine = substring between first comma and last comma.
//     const firstComma = line.indexOf(',');
//     const lastComma = line.lastIndexOf(',');
//     if (firstComma === -1 || lastComma === -1 || lastComma === firstComma) continue;

//     const pidStr = line.slice(lastComma + 1).trim();
//     const pid = parseInt(pidStr, 10);
//     const cmd = line.slice(firstComma + 1, lastComma).trim();

//     if (!pid || !cmd) continue;
//     results.push({ pid, commandLine: cmd });
//   }

//   return results;
// }

// function listProcessesWMIC() {
//   return new Promise(resolve => {
//     exec('wmic process get ProcessId,CommandLine /FORMAT:CSV', { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
//       if (err || !stdout) return resolve([]);
//       try {
//         const parsed = parseWmicCsvOutput(stdout);
//         return resolve(parsed);
//       } catch (e) {
//         return resolve([]);
//       }
//     });
//   });
// }

// // ---------- try powershell then fallback to WMIC ----------
// async function listSuspiciousProcesses() {
//   if (process.platform !== 'win32') return [];

//   const psCmd = [
//     'Get-CimInstance Win32_Process',
//     "| Where-Object { $_.CommandLine -ne $null }",
//     '| Select-Object ProcessId,CommandLine',
//     '| ConvertTo-Json -Compress'
//   ].join(' ');

//   try {
//     const stdout = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
//     if (!stdout) return [];

//     const parsed = JSON.parse(stdout);
//     const items = Array.isArray(parsed) ? parsed : [parsed];

//     // normalize to objects { pid, commandLine }
//     const mapped = items.map(it => {
//       const pid = Number(it.ProcessId || it.processid || 0);
//       const commandLine = String(it.CommandLine || it.Commandline || "");
//       return { pid, commandLine };
//     }).filter(it => it.pid && it.commandLine);

//     // Optional debug: log first few command lines to inspect (disable in prod)
//     // console.log("DEBUG: first processes:", mapped.slice(0,8).map(p=>p.commandLine));

//     // Filter with robust matcher
//     return mapped.filter(it => isSuspiciousCmd(it.commandLine));
//   } catch (e) {
//     // fallback
//     try {
//       const all = await listProcessesWMIC();
//       return all.filter(it => isSuspiciousCmd(it.commandLine));
//     } catch (err) {
//       console.error("listSuspiciousProcesses fallback error", err);
//       return [];
//     }
//   }
// }

// // ---------- keep your ipcMain.handle (unchanged) ----------
// ipcMain.handle('scan-suspicious-processes', async () => {
//   try {
//     const procs = await listSuspiciousProcesses();
//     return procs.map(p => ({ pid: p.pid, commandLine: p.commandLine }));
//   } catch (e) {
//     console.error('scan-suspicious-processes error', e);
//     return [];
//   }
// });


// ---------- suspicious / safe words ----------
const SUSPICIOUS_KEYWORDS = [
  "chatgpt","gpt","chrome","firefox","brave","edge","opera",
  "code","pycharm","anaconda","notepad++",
  "autoit","ahk","sikulix","uiautomation","uipath","automation","copilot"
];

const SAFE_KEYWORDS = [
  "kodin",
  "electron",
  "explorer.exe",
  "cmd.exe",
  "powershell.exe",
  "system",
  "svchost",
  "winlogon",
  "wininit",
  "conhost.exe",

  // OS/UI processes
  "sihost.exe",
  "taskhostw.exe",
  "uihost.exe",

  // laptop drivers
  "syntpenh.exe",
  "browser_assistant.exe",

  // Adobe services
  "adobecollabsync.exe",

  // virtualization / driver modules
  "hyperpkicertd",
  "dne",

  // dev tools (optional)
  "server.bundle.js",
  "typesmap.json",
  "tscancellation",
  "prefetch",
  "report",
  "jsonservermain"
];

// ---------- only process name extracted ----------
function extractProcessName(cmd) {
  if (!cmd) return "";
  const lower = cmd.toLowerCase();

  // pick last part after slash or backslash
  const match = lower.split(/[/\\]/).pop().trim();

  // e.g., "chrome.exe" or "python.exe"
  return match.split(" ")[0].replace(/"/g, "");
}

// ---------- robust suspicious check ----------
function isSuspiciousCmd(cmd) {
  if (!cmd) return false;
  const lower = cmd.toLowerCase();

  // ignore your own app
  if (lower.includes("kodin")) return false;
  if (lower.includes("electron")) return false;

  // ignore safe patterns
  for (const safe of SAFE_KEYWORDS) {
    if (lower.includes(safe)) return false;
  }

  // detect any .exe
  if (/\.exe([ "'"]|$)/i.test(lower)) return true;

  // detect .py except kodin python
  if (lower.includes(".py") && !lower.includes("kodin")) return true;

  // keyword hits
  for (const word of SUSPICIOUS_KEYWORDS) {
    if (lower.includes(word)) return true;
  }

  return false;
}

// ---------- PowerShell → fallback WMIC ----------
async function listSuspiciousProcesses() {
  if (process.platform !== 'win32') return [];

  const psCmd = [
    'Get-CimInstance Win32_Process',
    "| Where-Object { $_.CommandLine -ne $null }",
    '| Select-Object ProcessId,CommandLine',
    '| ConvertTo-Json -Compress'
  ].join(" ");

  const suspiciousNames = new Set(); // ensure uniqueness

  try {
    const stdout = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
    const parsed = stdout ? JSON.parse(stdout) : [];
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    arr.forEach(proc => {
      const cmd = String(proc.CommandLine || "");
      if (isSuspiciousCmd(cmd)) {
        const pname = extractProcessName(cmd);
        if (pname && !SAFE_KEYWORDS.includes(pname)) {
          suspiciousNames.add(pname);
        }
      }
    });

    return [...suspiciousNames];
  } catch (e) {
    // fallback to WMIC
    try {
      const wmicData = await execPromise(`wmic process get Name,CommandLine /FORMAT:CSV`);
      const lines = wmicData.split(/\r?\n/).filter(Boolean);

      lines.forEach(line => {
        if (/^Node,/i.test(line)) return; // skip header
        const parts = line.split(",");
        const cmd = parts.slice(1, parts.length - 1).join(",").trim();
        if (!cmd) return;

        if (isSuspiciousCmd(cmd)) {
          const pname = extractProcessName(cmd);
          if (pname && !SAFE_KEYWORDS.includes(pname)) {
            suspiciousNames.add(pname);
          }
        }
      });

      return [...suspiciousNames];
    } catch {
      return [];
    }
  }
}

// ---------- IPC handler ----------
ipcMain.handle('scan-suspicious-processes', async () => {
  try {
    return await listSuspiciousProcesses();  // returns ["chrome.exe", "code.exe", ...]
  } catch (e) {
    console.error("scan-suspicious-processes err", e);
    return [];
  }
});

const ALGO = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update("kodinappv2@").digest(); // ⚠️ replace with secure key mgmt
const IVLEN = 16;

  function encryptBuffer(str) { 
    const buf = Buffer.from(str, "utf8");
    const iv = crypto.randomBytes(IVLEN);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]); // raw encrypted buffer
  }

  
// 🔓 Decrypt buffer → UTF-8 string
function decryptBuffer(buf) {
  const iv = buf.slice(0, IVLEN);
  const tag = buf.slice(IVLEN, IVLEN + 16);
  const enc = buf.slice(IVLEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8"); // always UTF-8 string
}

// 🔒 Write encrypted shadow file
async function writeShadow(originalPath, content) {
  const folder = path.dirname(originalPath);
  const base = path.basename(originalPath);
  const shadowDir = path.join(folder, ".kodin");
  await fsp.mkdir(shadowDir, { recursive: true });

  const shadowPath = path.join(shadowDir, `${base}.kodin`);
  const encBuf = encryptBuffer(content); // content is string
  await fsp.writeFile(shadowPath, encBuf);

  return shadowPath;
}

// 🔓 Read shadow (if exists + valid)
async function readShadow(originalPath) {
  try {
    const folder = path.dirname(originalPath);
    const base = path.basename(originalPath);
    const shadowPath = path.join(folder, ".kodin", `${base}.kodin`);

    const buf = await fsp.readFile(shadowPath);
    const dec = decryptBuffer(buf);   // always UTF-8 string
    return dec;                       // may be "" (valid empty file)
  } catch {
    return null; // missing or corrupted
  }
}

// 

// 🛡️ Scan a folder for source files without valid shadows → quarantine
async function scanAndQuarantine(folderPath, opts = {}) {
  const exts = opts.exts || [".c", ".cpp", ".py", ".java", ".js", ".ts"];
  const quarantineDir = path.join(folderPath, ".kodin_quarantine");
  await fsp.mkdir(quarantineDir, { recursive: true });

  const list = await fsp.readdir(folderPath, { withFileTypes: true });
  for (const d of list) {
    if (!d.isFile()) continue;
    const ext = path.extname(d.name).toLowerCase();
    if (!exts.includes(ext)) continue;

    const abs = path.join(folderPath, d.name);
    const content = await readShadow(abs);
    if (content === null) {
      // 🚨 Shadow missing/corrupt → quarantine
      const dest = path.join(quarantineDir, `${d.name}.${Date.now()}`);
      await fsp.rename(abs, dest);
      await fsp.writeFile(
        abs,
        `// ⚠️ Quarantined by Kodin\n// Shadow missing for ${d.name}\n// Original moved to ${dest}\n`,
        "utf8"
      );
    }
  }
  return { success: true, quarantineDir };
}




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

  // 1️⃣ Write the original file (editor sees this)
  await fsp.writeFile(filePath, content, 'utf-8');

  // 2️⃣ Update/create shadow for security
  try {
    await writeShadow(filePath, content);
  } catch (err) {
    console.error("Failed to write shadow:", err);
    // Optional: quarantine file if shadow creation fails
  }

  return { canceled: false, filePath };
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



// ---------------- OPEN FOLDER ----------------
ipcMain.handle("dialog:openFolder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (canceled) return { canceled: true };

  // ✅ Always resolve to safe/short path
  const folderPath = getSafeAndShortPath(filePaths[0]);

  const tree = await buildFolderTree(folderPath); // no circular refs

  // 🔒 Scan and quarantine
  const { quarantineRoot } = await scanAndQuarantine(folderPath);

  return {
    canceled: false,
    folderPath,
    tree,
    quarantineRoot: getSafeAndShortPath(quarantineRoot),
  };
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


// In main process
ipcMain.handle('getPlatformExt', () => {
  return process.platform === 'win32' ? '.exe' : '.out';
});

ipcMain.handle("path:getDirName", (event, filePath) => {
  return path.dirname(filePath);
});






ipcMain.handle('join-path', (_, folder, file) => {
  return path.join(folder, file);
}); 





const getExportExecutablePath = () => {
  return isDev
    ? path.join(__dirname, 'scripts', 'export_report.exe')  // dev
    : path.join(process.resourcesPath, 'export_report.exe');           // prod
};

 





// ipcMain.handle("export-report", async (_event, args) => {
//   const { openedFiles, currentUser, currentFolder, outputs } = args;
//   const exePath = getExportExecutablePath();

//   return new Promise(async (resolve) => {
//     try {
//       // 1️⃣ Filter out .kodin paths (we only want user-facing files)
//       let filteredFiles = (openedFiles || []).filter(f => !f.includes(`${path.sep}.kodin${path.sep}`));

//       // 2️⃣ Validate existence (skip missing files)
//       const validFiles = [];
//       const missingFiles = [];
//       for (const file of filteredFiles) {
//         try {
//           await fsp.access(file);
//           validFiles.push(file);
//         } catch {
//           console.warn(`⚠️ Skipping missing file: ${file}`);
//           missingFiles.push(file);
//         }
//       }

//       if (validFiles.length === 0) {
//         console.error("❌ No valid files found for export.");
//         resolve({ success: false, error: "No valid files found for export (all missing or .kodin)" });
//         return;
//       }

//       console.log("📦 Exporting report with files:", validFiles);

//       let output = "";
//       let errorOutput = "";

//       const py = spawn(exePath, [
//         JSON.stringify(validFiles),
//         currentUser || "unknown_user",
//         currentFolder || "",
//         outputs || ""
//       ]);

//       py.stdout.on("data", (data) => {
//         output += data.toString();
//       });

//       py.stderr.on("data", (data) => {
//         errorOutput += data.toString();
//       });

//       py.on("error", (err) => {
//         console.error("❌ Failed to start Python process:", err);
//         resolve({ success: false, error: `Spawn error: ${err.message}` });
//       });

//       py.on("close", async (code) => {
//         if (code === 0) {
//           output = output.replace(/\r/g, "").trim();

//           // Detect PDF path from Python output
//           const match = output.match(/Report\s+exported\s+to[:\s]+(.+\.pdf)/i);

//           if (match && match[1]) {
//             const raw = match[1].replace(/[\r\n]+/g, "").trim();
//             const fullPath = path.isAbsolute(raw)
//               ? raw
//               : path.join(currentFolder || "", raw);

//             try {
//               await fsp.access(fullPath);
//               resolve({ success: true, path: fullPath });
//             } catch {
//               console.error("❌ PDF file not found after export:", fullPath);
//               resolve({ success: false, error: `PDF file not found after export: ${fullPath}` });
//             }
//           } else {
//             console.error("❌ Could not detect PDF path in output:", output);
//             resolve({ success: false, error: "No PDF path found in Python output" });
//           }
//         } else {
//           console.error("❌ Python process exited with error:", errorOutput);
//           resolve({
//             success: false,
//             error: `Python export failed: ${errorOutput || "Unknown error"}`
//           });
//         }
//       });
//     } catch (err) {
//       console.error("❌ Unexpected exception in export-report:", err);
//       resolve({ success: false, error: err.message || "Unexpected error" });
//     }
//   });
// });


ipcMain.handle("export-report", async (_event, args) => {
  const { openedFiles, currentUser, currentFolder, outputs, examLog = [] } = args;
  const exePath = getExportExecutablePath();

  return new Promise(async (resolve) => {
    try {
      // 1️⃣ Filter .kodin internal files
      let filteredFiles = (openedFiles || []).filter(
        f => !f.includes(`${path.sep}.kodin${path.sep}`)
      );

      // 2️⃣ Keep only existing files
      const validFiles = [];
      for (const file of filteredFiles) {
        try {
          await fsp.access(file);
          validFiles.push(file);
        } catch {
          console.warn(`⚠️ Skipping missing file: ${file}`);
        }
      }

      if (validFiles.length === 0) {
        resolve({
          success: false,
          error: "No valid files found for export (all missing or .kodin)"
        });
        return;
      }

      console.log("📦 Exporting report with files:", validFiles);

      let output = "";
      let errorOutput = "";

      const safeExamLog = JSON.stringify(examLog);

      console.log("examlog passed:",safeExamLog);
      const py = spawn(exePath, [
        JSON.stringify(validFiles),
        currentUser || "unknown_user",
        currentFolder || "",
        outputs || "",
        safeExamLog   // passing examLog safely
      ]);

      py.stdout.on("data", (data) => (output += data.toString()));
      py.stderr.on("data", (data) => (errorOutput += data.toString()));

      py.on("error", (err) => {
        resolve({ success: false, error: `Spawn error: ${err.message}` });
      });

      py.on("close", async (code) => {
        if (code === 0) {
          output = output.replace(/\r/g, "").trim();

          // ⭐ MOST TOLERANT REGEX → works for all formats
          const match = output.match(/Report\s+exported\s+to[:\s]+(.+\.pdf)/i);
          console.log("match:",match);

          if (match && match[1]) {
            const raw = match[1].trim();

            const fullPath = path.isAbsolute(raw)
              ? raw
              : path.join(currentFolder || "", raw);

            try {
              await fsp.access(fullPath);
              resolve({ success: true, path: fullPath });
            } catch {
              resolve({
                success: false,
                error: `PDF file not found after export: ${fullPath}`
              });
            }
          } else {
            resolve({ success: false, error: "No PDF path found in Python output" });
          }
        } else {
          resolve({
            success: false,
            error: `Python export failed: ${errorOutput || "Unknown error"}`
          });
        }
      });

    } catch (err) {
      resolve({ success: false, error: err.message });
    }
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


// ------------------------
// Save Temp File with Shadow
// ------------------------
ipcMain.handle('save-temp-file', async (event, defaultName) => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Save File',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePath;

    // 1️⃣ Always create a clean UTF-8 file
    await fsp.writeFile(filePath, "", { encoding: "utf8" });

    // 2️⃣ Create shadow mirror
    await writeShadow(filePath, "");

    return { success: true, canceled: false, filePath };
  } catch (err) {
    console.error("❌ save-temp-file failed:", err);
    return { success: false, error: err.message };
  }
});


// ---------------- SAVE QUESTION FILES ----------------
ipcMain.handle("save-question-files", async (_, { questionText }) => {
  try {
    

    // Helper: return safe Desktop path (fallback to OneDrive or home)
    function getDesktopPath() {
      const desktop = path.join(os.homedir(), "Desktop");
      if (fs.existsSync(desktop)) return desktop;

      const oneDriveDesktop = path.join(os.homedir(), "OneDrive", "Desktop");
      if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;

      // fallback: user home
      return os.homedir();
    }

    // Helper: safely create directory
    async function safeMkdir(dir) {
      try {
        await fsp.mkdir(dir, { recursive: true });
        return true;
      } catch (err) {
        console.warn("⚠️ Cannot create folder:", dir, err.message);
        return false;
      }
    }

    // Determine base directory
    const desktopDir = getDesktopPath();
    let baseDir = path.join(desktopDir, "Kodin", "Questions");

    // Ensure base folder exists
    let baseCreated = await safeMkdir(baseDir);
    if (!baseCreated) {
      // fallback to user's home directory if Desktop is blocked
      baseDir = path.join(os.homedir(), "Kodin", "Questions");
      await safeMkdir(baseDir);
      console.warn("⚠️ Desktop folder inaccessible, using fallback:", baseDir);
    }

    // Final Question folder path using getSafeAndShortPath
    const fullPath = getSafeAndShortPath(path.join(baseDir, "Question"));

    // Remove old Question folder if it exists
    try {
      await fsp.rm(fullPath, { recursive: true, force: true });
    } catch (err) {
      console.warn("⚠️ Could not remove old Question folder:", err.message);
    }

    // Create fresh Question folder
    await safeMkdir(fullPath);

    // Files to create
    const files = [
      { name: "question.txt", content: questionText || "" },
      { name: "algorithm.txt", content: "" },
      { name: "aim.txt", content: "" },
      { name: "conclusion.txt", content: "" },
    ];

    for (const file of files) {
      const filePath = getSafeAndShortPath(path.join(fullPath, file.name));

      // 1️⃣ UTF-8 file
      await fsp.writeFile(filePath, file.content, { encoding: "utf8" });

      // 2️⃣ Shadow
      await writeShadow(filePath, file.content);
    }

    console.log("✅ Question folder created:", fullPath);
    return { success: true, folder: fullPath };

  } catch (err) {
    console.error("❌ Error saving question files:", err);
    return { success: false, error: err.message };
  }
});




// // ---------------- SAVE QUESTION FILES ----------------
// ipcMain.handle("save-question-files", async (_, { questionText }) => {
//   try {
    

//     // Helper: return safe Desktop path (fallback to OneDrive or home)
//     function getDesktopPath() {
//       const desktop = path.join(os.homedir(), "Desktop");
//       if (fs.existsSync(desktop)) return desktop;

//       const oneDriveDesktop = path.join(os.homedir(), "OneDrive", "Desktop");
//       if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;

//       // fallback: user home
//       return os.homedir();
//     }

//     // Helper: safely create directory
//     async function safeMkdir(dir) {
//       try {
//         await fsp.mkdir(dir, { recursive: true });
//         return true;
//       } catch (err) {
//         console.warn("⚠️ Cannot create folder:", dir, err.message);
//         return false;
//       }
//     }

//     // Determine base directory
//     const desktopDir = getDesktopPath();
//     const baseDir = path.join(desktopDir, "Kodin", "Questions");
//     const fullPath = path.join(baseDir, "Question");

//     // Ensure base folder exists
//     const baseCreated = await safeMkdir(baseDir);
//     if (!baseCreated) {
//       // fallback to user's home directory if Desktop is blocked
//       const fallbackBase = path.join(os.homedir(), "Kodin", "Questions");
//       await safeMkdir(fallbackBase);
//       console.warn("⚠️ Desktop folder inaccessible, using fallback:", fallbackBase);
//       fullPath = path.join(fallbackBase, "Question");
//     }

//     // Remove old Question folder if it exists
//     try {
//       await fsp.rm(fullPath, { recursive: true, force: true });
//     } catch (err) {
//       console.warn("⚠️ Could not remove old Question folder:", err.message);
//     }

//     // Create fresh Question folder
//     await safeMkdir(fullPath);

//     // Files to create
//     const files = [
//       { name: "question.txt", content: questionText || "" },
//       { name: "algorithm.txt", content: "" },
//       { name: "aim.txt", content: "" },
//       { name: "conclusion.txt", content: "" },
//     ];

//     for (const file of files) {
//       const filePath = path.join(fullPath, file.name);

//       // 1️⃣ UTF-8 file
//       await fsp.writeFile(filePath, file.content, { encoding: "utf8" });

//       // 2️⃣ Shadow
//       await writeShadow(filePath, file.content);
//     }

//     // console.log("✅ Question folder created:", fullPath);
//     return { success: true, folder: fullPath };

//   } catch (err) {
//     console.error("❌ Error saving question files:", err);
//     return { success: false, error: err.message };
//   }
// });



// ------------------------
// Create File in Folder
// ------------------------

ipcMain.handle('create-file-in-folder', async (_, { folderPath, fileName }) => {
  try {
    const filePath = path.join(folderPath, fileName);

    // 1️⃣ Always create a clean UTF-8 text file for editor
    await fsp.writeFile(filePath, "", { encoding: "utf8" });

    // 2️⃣ Create matching empty shadow for security
    await writeShadow(filePath, "");

    // 3️⃣ Return initial content as string for editor
    return { success: true, filePath, content: "" };

  } catch (err) {
    console.error("Create failed:", err);
    return { success: false, error: err.message, content: "" }; // always string
  }
});


// ------------------------
// Read File
// ------------------------
function hashContent(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

ipcMain.handle("readFile", async (_, filePath) => {
  try {
    // 🔒 Load shadow (must exist & be valid)
    const ext = path.extname(filePath).toLowerCase();
    if ([".pdf"].includes(ext)) {
      const content = await fsp.readFile(filePath, "utf8");
      return { content };
    }
    const shadowContent = await readShadow(filePath);

    if (shadowContent === null) {
      // Shadow missing → quarantine
      const folder = path.dirname(filePath);
      const quarantineDir = path.join(folder, ".quarantined");
      await fsp.mkdir(quarantineDir, { recursive: true });

      const dest = path.join(quarantineDir, `${path.basename(filePath)}.${Date.now()}`);
      await fsp.rename(filePath, dest);

      const warning = `//This File is quarantined. Shadow missing or corrupted.\n// This action will be reported \n`;
      await fsp.writeFile(filePath, warning, "utf8");

      return { content: warning, quarantined: true };
    }

    // 📖 Read original source
    const originalContent = await fsp.readFile(filePath, { encoding: "utf8" });

    // 🔍 Compare hash of original vs shadow
    const origHash = hashContent(originalContent);
    const shadowHash = hashContent(shadowContent);

    if (origHash !== shadowHash) {
      // ❌ Altered outside Kodin → quarantine immediately
      const folder = path.dirname(filePath);
      const quarantineDir = path.join(folder, ".kodin_quarantine");
      await fsp.mkdir(quarantineDir, { recursive: true });

      const dest = path.join(quarantineDir, `${path.basename(filePath)}.${Date.now()}`);
      await fsp.rename(filePath, dest);

      const warning = `//This File is quarantined. It was altered outside Kodin.\n//This action will be reported \n`;
      await fsp.writeFile(filePath, warning, "utf8");

      return { content: warning, quarantined: true };
    }

    // ✅ Safe → return original for editor
    return { content: originalContent };

  } catch (err) {
    console.error("Error reading file:", err);
    return { content: `//  Failed to read file: ${err.message}` };
  }
});





ipcMain.handle("save-file", async (_, filePath, content) => {
  try {
    // 1️⃣ Save clean UTF-8 content to original
    await fsp.writeFile(filePath, content, { encoding: "utf8" });

    // 2️⃣ Save encrypted mirror to shadow
    await writeShadow(filePath, content);

    return { success: true };
  } catch (err) {
    console.error("Save failed:", err);
    return { success: false, error: err.message };
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



function normalizeOutput(data) {
  let cleaned = data.toString("utf8"); // ✅ force UTF-8 decoding

  // Remove ANSI CSI (e.g. \x1b[31m, \x1b[2J, etc.)
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");

  // Remove OSC sequences: ESC ] ... BEL or ST
  cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "");

  // Remove charset changes (like ESC ( B)
  cleaned = cleaned.replace(/\x1b\([A-B0-2]/g, "");

  // Remove any stray ESC or control chars except CR/LF/TAB
  cleaned = cleaned.replace(/[\x00-\x09\x0B-\x1A\x1C-\x1F\x7F]/g, "");

  // Normalize line endings for Windows terminals
  cleaned = cleaned.replace(/\r(?!\n)/g, "\r\n");
  cleaned = cleaned.replace(/\n/g, "\r\n");

  return cleaned;
}


function safeSpawn(cmd, args = [], options = {}) {
  return spawn(cmd, args, {
    ...options,
    shell: false, // ✅ never use shell:true unless you REALLY need it
    windowsHide: true,
  });
}





ipcMain.handle('run-sql-stream', async (_event, { cmd, args = [], sqlFile }) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    // ✅ Wrap executable path for Windows to handle spaces
    // const quotedCmd = process.platform === 'win32' ? `"${cmd}"` :  cmd;

    // const proc = spawn(quotedCmd, args, {
    //   cwd: process.cwd(),
    //   windowsHide: true,
    //   shell: false,
    //   env: {
    //     ...process.env,
    //     PATH: extendPathForTool(cmd)
    //   }
    // });
    const proc = safeSpawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env, PATH: extendPathForTool(cmd) },
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



ipcMain.on('sendInteractiveInput', (event, pid, data) => {
  const item = interactiveProcesses.get(pid);
  if (item) item.process.write(data);
});

// ✅ Normal command execution (for compilation)
ipcMain.handle('runCommand', async (event, cmd, args = [], filePath = null) => {
  return new Promise((resolve) => {
    const cwd = filePath ? path.dirname(filePath) : process.cwd();
    const child = safeSpawn(cmd, args, { cwd });


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


ipcMain.handle('getSafeSource', async (_, srcPath) => {
  try {
    const tmpDir = path.join(os.tmpdir(), "kodin");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const safePath = path.join(tmpDir, path.basename(srcPath));
    fs.copyFileSync(srcPath, safePath);

    return safePath;
  } catch (err) {
    console.error("getSafeSource failed:", err);
    return srcPath; // fallback: original path
  }
});

function fixPathForCompiler(p) {
  if (process.platform === "win32") {
    try {
      return fs.realpathSync.native(p); // returns 8.3 short path if needed
    } catch {
      return p; // fallback
    }
  }
  return p; // non-Windows: leave as-is
}

// expose for IPC
ipcMain.handle("path:fixForCompiler", async (_event, filePath) => {
  return fixPathForCompiler(filePath);
});





// Load credentials
async function loadCredentials() {
  try {
    await ensureDir();
    const data = await fs.readFile(credsFile, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return []; // empty if not found
  }
}

const credsFile = path.join(os.homedir(), '.kodin', 'credentials.json');
// Save new credential (append if not duplicate)
async function saveCredentials(newCred) {
  await ensureDir();
  let creds = await loadCredentials();

  // check duplicate (same institute + role + email_or_roll)
  const exists = creds.find(c =>
    c.institute === newCred.institute &&
    c.role === newCred.role &&
    c.email_or_roll === newCred.email_or_roll
  );

  if (!exists) {
    creds.push(newCred);
    await fs.writeFile(credsFile, JSON.stringify(creds, null, 2), 'utf-8');
  }
  return creds;
}

ipcMain.handle('credentials:load', async () => {
  try {
    const creds = await loadCredentials();
    return { success: true, data: creds };
  } catch (err) {
    console.error('credentials:load error:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('credentials:save', async (_, cred) => {
  try {
    const creds = await saveCredentials(cred);
    return { success: true, data: creds };
  } catch (err) {
    console.error('credentials:save error:', err);
    return { success: false, message: err.message };
  }
});

function getSafeAndShortPath(p) {
  try {
    let real = fs.realpathSync.native(p); // resolves symlinks and gives native path
    if (process.platform === "win32") {
      // Try to get short 8.3 path
      try {
        real = execSync(`for %I in ("${real}") do @echo %~sI`, {
          shell: "cmd.exe"
        }).toString().trim();
      } catch {
        // fallback to real path if cmd fails
      }
    }
    return real;
  } catch (err) {
    console.warn("getSafeAndShortPath fallback:", err.message);
    return p;
  }
}
