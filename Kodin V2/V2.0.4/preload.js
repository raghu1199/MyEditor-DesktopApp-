const { contextBridge, ipcRenderer } = require('electron');




contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
//  saveFile: (filePath, content) => ipcRenderer.invoke('file:saveFile', filePath, content),
//  saveFileAs: (content) => ipcRenderer.invoke('file:saveAsFile', content),
saveFile: (filePath, content) => ipcRenderer.invoke('dialog:saveFile', { filePath, content }),
  saveAsFile: (content) => ipcRenderer.invoke('file:saveAsFile', content),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (path) => ipcRenderer.invoke('readFile', path), // ✅ Add this
  runCommand: (cmd) => ipcRenderer.invoke('run-command', cmd),
  windowControl: (action) => ipcRenderer.send('window-control', action),

  joinPath: (folder, file) => ipcRenderer.invoke('join-path', folder, file),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveTempFile', defaultName),
  saveTempFile: (defaultName) => ipcRenderer.invoke('save-temp-file', defaultName),

  getFolderTree: (folderPath) => ipcRenderer.invoke('get-folder-tree', folderPath),
  getDirName: (fullPath) => ipcRenderer.invoke('path:getDirName', fullPath),

  renameFileOrFolder: (oldPath, newPath) => ipcRenderer.invoke('rename-file-or-folder', oldPath, newPath),
  fileExists: (path) => ipcRenderer.invoke('file-exists', path),

  writeOutputToTempFile: (outputText) => ipcRenderer.invoke('write-output-temp', outputText),

  saveQuestionFiles: (data) => ipcRenderer.invoke('save-question-files', data),

  createFileInFolder: (data) => ipcRenderer.invoke("create-file-in-folder", data),
  createFolderInFolder: (data) => ipcRenderer.invoke("create-folder-in-folder", data),

  // runCommand: (cmd, args = []) => ipcRenderer.invoke('run-command', { cmd, args }),

  // run command and stream stdout/stderr back. returns final code and buffers
  // runCommandStream: (cmd, args = []) => ipcRenderer.invoke('run-command-stream', { cmd, args }),
  // runCommandStream: (cmd, args = [], cwd = null) =>ipcRenderer.invoke('run-command-stream', { cmd, args, cwd }),
  runCommandStream: (cmd, args = [], filePath = null) =>
    ipcRenderer.invoke("run-command-stream", { cmd, args, filePath }),
  runSQLStream: (cmd, args, sqlFile) =>
    ipcRenderer.invoke("run-sql-stream", { cmd, args, sqlFile }),
  runCommandT: (command, cwd) => ipcRenderer.invoke("run-commandt", { command, cwd }),
  
   
  
  
  resizePty: (cols, rows) => ipcRenderer.send("terminal-resize", { cols, rows }),
  onRunOutput: (callback) => ipcRenderer.on("run-output", callback),

 viteStart: () => ipcRenderer.invoke("vite-start"),
  viteShutdown: () => ipcRenderer.invoke("vite-shutdown"),

  getBundledToolsPaths: () => ipcRenderer.invoke('get-bundled-tools-paths'),
  getExt: async () => {
    return await ipcRenderer.invoke('getPlatformExt');
  },

  
  // exportReport: (openedFiles, currentUser, currentFolder,outputs) => ipcRenderer.invoke('export-report', {
  //   openedFiles,
  //   currentUser,
  //   currentFolder,
  //   outputs
  // }),
  exportReport: (openedFiles, currentUser, currentFolder, outputs, examLog = []) =>
  ipcRenderer.invoke("export-report", {
    openedFiles,
    currentUser,
    currentFolder,
    outputs,
    examLog, // optional, defaults to empty array
  }),


  readFileAsBlob: async (filePath) => {
    const buffer = await ipcRenderer.invoke('read-file-as-blob', filePath);
    if (!buffer) throw new Error('Failed to read file.');
    return new Blob([buffer], { type: 'application/pdf' });
  },
// onRunOutput: (callback) =>
//     ipcRenderer.on("run-output", (_, data) => callback(data)),

  onRunExit: (callback) =>
    ipcRenderer.on("run-exit", (_, data) => callback(data)),

   
  // Input & resize
  // sendInput: (data) => ipcRenderer.send("terminal-input", data),
  // resize: (cols, rows) => ipcRenderer.send("terminal-resize", { cols, rows }),

  // Prompt
  

  // Output listener
  // onOutput: (callback) =>
  //   ipcRenderer.on("terminal-output", (_event, data) => callback(data)),

  

  // login: () => ipcRenderer.invoke("terminal-login"),
  // logout: () => ipcRenderer.invoke("terminal-logout"),
  // sendInput: (data) => ipcRenderer.send("terminal-input", data),
  // resize: (cols, rows) => ipcRenderer.send("terminal-resize", { cols, rows }),
  // printPrompt: () => ipcRenderer.invoke("terminal-print-prompt"),
  


  // Optional: remove output listener explicitly
  removeOutputListener: (callback) => {
    if (callback) {
      ipcRenderer.removeListener("terminal-output", callback);
    }
  },
  onTerminalEcho: (callback) => ipcRenderer.on('terminal-echo', (event, data) => callback(data)),
  // readFile: (filePath) => ipcRenderer.invoke("readfile", filePath),
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),
  renameFile: (filePath, newName) => ipcRenderer.invoke("rename-file", { filePath, newName }),
  getBinOutputPath: (params) => ipcRenderer.invoke('get-bin-output-path', params),
  runCCommandStream: (cmd, args, cwd) => ipcRenderer.invoke('run-c-command-stream', { cmd, args, cwd }),
sendStdin: (input) => ipcRenderer.send('send-stdin', input),
// writeToTerminal: (cmd) => ipcRenderer.send('terminal:write', cmd)
getPlatform: () => ipcRenderer.invoke('get-platform'),
getTempExePath: (fileName, ext) => ipcRenderer.invoke('path:getTempExePath', { fileName, ext }),
sendTerminalInput: (data) => ipcRenderer.send('terminal-input', data),
send: (channel, data) => ipcRenderer.send(channel, data) ,

// startInteractiveProcess: (cmd, filePath) =>
//     ipcRenderer.invoke('startInteractiveProcess', cmd, filePath),
startInteractiveProcess: (cmd, args = [], filePath = null) => {
    return ipcRenderer.invoke('startInteractiveProcess', cmd, args, filePath);
  },

  sendInteractiveInput: (pid, data) =>
    ipcRenderer.send('sendInteractiveInput', pid, data),
  finishInteractive: (pid) =>
    ipcRenderer.send('finishInteractive', pid),
  onOutput: (callback) => ipcRenderer.on('shell-output', (_, data) => callback(data)),
  runCommand: (cmd, args, filePath) => ipcRenderer.invoke('runCommand', cmd, args, filePath) ,// Add this if not present
   finishInteractive: (pid) => ipcRenderer.invoke('finishInteractive', pid),

  openShell: () => ipcRenderer.invoke("openShell"),
  closeShell: () => ipcRenderer.invoke("closeShell"),
  resizeShell: (cols, rows) => ipcRenderer.invoke("resizeShell", cols, rows),
  sendTerminalInput: (data) => ipcRenderer.send("terminal-input", data),

  // Listen for shell output
  onShellOutput: (callback) => {
    ipcRenderer.removeAllListeners("shell-output"); // avoid duplicates
    ipcRenderer.on("shell-output", (event, data) => callback(data));
  },
  onModeChanged: (callback) => {
    ipcRenderer.removeAllListeners('mode-changed');
    ipcRenderer.on('mode-changed', (event, mode) => callback(mode));
  },
  //  resolveTutorialPdf: (fileName) => ipcRenderer.invoke("resolve-tutorial-pdf", fileName)

   resolveTutorialPdf: (fileName) => `app://pdfs/${fileName}`,
   getSafeSource: (srcPath) => ipcRenderer.invoke('getSafeSource', srcPath), 
   fixPathForCompiler: (filePath) =>
    ipcRenderer.invoke("path:fixForCompiler", filePath),

  

  // onDetected: (callback) => ipcRenderer.on('automation-detected', (_, data) => callback(data)),
  // onCleared: (callback) => ipcRenderer.on('automation-clear', () => callback())
  onAutomationDetected: (callback) => ipcRenderer.on('automation-detected', (_, data) => callback(data)),
  onAutomationCleared: (callback) => ipcRenderer.on('automation-clear', () => callback()),
   scanSuspiciousProcesses: () => ipcRenderer.invoke('scan-suspicious-processes'),
});


