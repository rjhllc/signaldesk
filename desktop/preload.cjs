'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const IPC_GET_CONFIGURATION = 'signaldesk:get-configuration';
const IPC_SAVE_CONFIGURATION = 'signaldesk:save-configuration';
const IPC_OPEN_DATA_LOCATION = 'signaldesk:open-data-location';
const IPC_GET_SAVED_SEARCHES = 'signaldesk:get-saved-searches';
const IPC_SAVE_SAVED_SEARCHES = 'signaldesk:save-saved-searches';
const IPC_GET_UPDATE_STATE = 'signaldesk:get-update-state';
const IPC_DOWNLOAD_UPDATE = 'signaldesk:download-update';
const IPC_INSTALL_UPDATE = 'signaldesk:install-update';
const IPC_UPDATE_STATE = 'signaldesk:update-state';

contextBridge.exposeInMainWorld('signaldeskDesktop', Object.freeze({
  getConfiguration: () => ipcRenderer.invoke(IPC_GET_CONFIGURATION),
  saveConfiguration: (configuration) => ipcRenderer.invoke(IPC_SAVE_CONFIGURATION, configuration),
  openDataLocation: () => ipcRenderer.invoke(IPC_OPEN_DATA_LOCATION),
  getSavedSearches: () => ipcRenderer.invoke(IPC_GET_SAVED_SEARCHES),
  saveSavedSearches: (searches) => ipcRenderer.invoke(IPC_SAVE_SAVED_SEARCHES, searches),
  getUpdateState: () => ipcRenderer.invoke(IPC_GET_UPDATE_STATE),
  downloadUpdate: () => ipcRenderer.invoke(IPC_DOWNLOAD_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC_INSTALL_UPDATE),
  onUpdateState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Update listener must be a function');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on(IPC_UPDATE_STATE, listener);
    return () => ipcRenderer.removeListener(IPC_UPDATE_STATE, listener);
  },
}));
