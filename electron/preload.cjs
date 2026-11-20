const { contextBridge, ipcRenderer } = require('electron');
const listen = channel => callback => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('floatTodo', Object.freeze({
  get: () => ipcRenderer.invoke('ft:get'),
  command: command => ipcRenderer.invoke('ft:command', command),
  window: action => ipcRenderer.invoke('ft:window', action),
  ballDrag: action => ipcRenderer.invoke('ft:ball-drag', action),
  pointer: action => ipcRenderer.invoke('ft:pointer', action),
  activeOpacity: value => ipcRenderer.invoke('ft:active-opacity',value),
  panelDrag: action => ipcRenderer.invoke('ft:panel-drag', action),
  importData: () => ipcRenderer.invoke('ft:import'),
  exportData: () => ipcRenderer.invoke('ft:export'),
  sync: (action,payload={}) => ipcRenderer.invoke('ft:sync',action,payload),
  onSync: listen('ft:sync-status'),
  onState: listen('ft:state'), onMode: listen('ft:mode'), onNotice: listen('ft:notice'), onSettings: listen('ft:settings'),onInteraction:listen('ft:interaction')
}));
