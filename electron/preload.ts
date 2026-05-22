import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherApi } from '../src/shared/contracts';
import { IPC_CHANNELS } from '../src/shared/constants';

const launcherApi: LauncherApi = {
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.bootstrap),
  saveSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, patch),
  loginAccount: (username, password) => ipcRenderer.invoke(IPC_CHANNELS.loginAccount, username, password),
  registerAccount: (username, password, email) => ipcRenderer.invoke(IPC_CHANNELS.registerAccount, username, password, email),
  logoutAccount: () => ipcRenderer.invoke(IPC_CHANNELS.logoutAccount),
  getAccountProfile: () => ipcRenderer.invoke(IPC_CHANNELS.getAccountProfile),
  updateAccountEmail: (email) => ipcRenderer.invoke(IPC_CHANNELS.updateAccountEmail, email),
  changeAccountPassword: (currentPassword, newPassword) => ipcRenderer.invoke(IPC_CHANNELS.changeAccountPassword, currentPassword, newPassword),
  startPasswordRecovery: (username) => ipcRenderer.invoke(IPC_CHANNELS.startPasswordRecovery, username),
  checkAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.checkAuthStatus),
  launchGame: () => ipcRenderer.invoke(IPC_CHANNELS.launchGame),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  openGameFolder: () => ipcRenderer.invoke(IPC_CHANNELS.openGameFolder),
  openLauncherDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.openLauncherDataFolder),
  openSettingsFile: () => ipcRenderer.invoke(IPC_CHANNELS.openSettingsFile),
  refreshServerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.refreshServerStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  onLaunchState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.launchState, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.launchState, wrapped);
  },
  onServerStatus: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.serverStatus, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.serverStatus, wrapped);
  },
  onUpdateInfo: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.updateInfo, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updateInfo, wrapped);
  },
};

contextBridge.exposeInMainWorld('launcher', launcherApi);
