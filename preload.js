const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vault', {
  selectVault: () => ipcRenderer.invoke('select-vault'),
  getVault: () => ipcRenderer.invoke('get-vault'),
  getItems: () => ipcRenderer.invoke('get-items'),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  downloadYouTube: (url, format) => ipcRenderer.invoke('download-youtube', url, format),
  downloadFile: (url, filename) => ipcRenderer.invoke('download-file', url, filename),
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (e, progress, message) => callback(progress, message))
  }
})
