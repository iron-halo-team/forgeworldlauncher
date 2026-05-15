import path from 'node:path';
import { app } from 'electron';
import type { LauncherStaticConfig } from '../src/shared/contracts';
import {
  BACKUPS_FOLDER,
  SETTINGS_FILE,
} from '../src/shared/constants';

export function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
}

export function getBundledDistributionDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'offline-distribution')
    : path.join(getAppRoot(), 'build', 'offline-distribution');
}

export function getLauncherConfigPath() {
  return path.join(getAppRoot(), 'launcher.config.json');
}

export function getLauncherContentPath() {
  return path.join(getAppRoot(), 'content', 'launcher-content.json');
}

export function getUserDataRoot() {
  return app.getPath('userData');
}

export function getSettingsPath() {
  return path.join(getUserDataRoot(), SETTINGS_FILE);
}

export function getLauncherLogPath() {
  return path.join(getUserDataRoot(), 'launcher.log');
}

export function getBackupsRoot() {
  return path.join(getUserDataRoot(), BACKUPS_FOLDER);
}

export function getGameRoot(config: LauncherStaticConfig) {
  return path.join(getUserDataRoot(), 'game', config.minecraft.instanceFolderName);
}
