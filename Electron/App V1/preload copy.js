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
});



