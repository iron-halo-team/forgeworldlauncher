export const DISTRIBUTION_MANIFEST_FILE = '.forge-world-distribution.json';
export const SETTINGS_FILE = 'settings.json';
export const BACKUPS_FOLDER = 'backups';

export const IPC_CHANNELS = {
  bootstrap: 'launcher:bootstrap',
  saveSettings: 'launcher:save-settings',
  loginAccount: 'launcher:auth-login',
  registerAccount: 'launcher:auth-register',
  logoutAccount: 'launcher:auth-logout',
  getAccountProfile: 'launcher:auth-profile',
  updateAccountEmail: 'launcher:auth-email',
  changeAccountPassword: 'launcher:auth-password',
  startPasswordRecovery: 'launcher:auth-recovery',
  checkAuthStatus: 'launcher:auth-status',
  launchGame: 'launcher:launch-game',
  minimizeWindow: 'launcher:minimize-window',
  toggleMaximizeWindow: 'launcher:toggle-maximize-window',
  closeWindow: 'launcher:close-window',
  openExternal: 'launcher:open-external',
  openGameFolder: 'launcher:open-game-folder',
  openLauncherDataFolder: 'launcher:open-launcher-data-folder',
  openSettingsFile: 'launcher:open-settings-file',
  refreshServerStatus: 'launcher:refresh-server-status',
  checkForUpdates: 'launcher:check-for-updates',
  launchState: 'launcher:event-launch-state',
  serverStatus: 'launcher:event-server-status',
  updateInfo: 'launcher:event-update-info',
} as const;
