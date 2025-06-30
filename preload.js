// Preload script for Electron
// You can expose APIs to the renderer here using contextBridge if needed
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Add APIs as needed
}); 