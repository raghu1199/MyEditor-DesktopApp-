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

  runCommand: (cmd, args = []) => ipcRenderer.invoke('run-command', { cmd, args }),

  // run command and stream stdout/stderr back. returns final code and buffers
  runCommandStream: (cmd, args = []) => ipcRenderer.invoke('run-command-stream', { cmd, args }),

  // return paths to bundled tool binaries (populated by main)
  getBundledToolsPaths: () => ipcRenderer.invoke('get-bundled-tools-paths'),
  getExt: async () => {
    return await ipcRenderer.invoke('getPlatformExt');
  },

  
  exportReport: (openedFiles, currentUser, currentFolder,outputs) => ipcRenderer.invoke('export-report', {
    openedFiles,
    currentUser,
    currentFolder,
    outputs
  }),


  readFileAsBlob: async (filePath) => {
    const buffer = await ipcRenderer.invoke('read-file-as-blob', filePath);
    if (!buffer) throw new Error('Failed to read file.');
    return new Blob([buffer], { type: 'application/pdf' });
  },
});



