const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
//  saveFile: (filePath, content) => ipcRenderer.invoke('file:saveFile', filePath, content),
//  saveFileAs: (content) => ipcRenderer.invoke('file:saveAsFile', content),
saveFile: (filePath, content) => ipcRenderer.invoke('dialog:saveFile', { filePath, content }),
  saveAsFile: (content) => ipcRenderer.invoke('file:saveAsFile', content),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (path) => ipcRenderer.invoke('readFile', path), // ✅ Add this
  windowControl: (action) => ipcRenderer.send('window-control', action),
});



