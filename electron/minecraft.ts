import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { launch } from '@xmcl/core';
import { getOfflineUUID, offline } from '@xmcl/user';
import { pathExists } from 'fs-extra';
import type {
  DistributionManifest,
  LaunchStatePayload,
  LauncherSettings,
  LauncherStaticConfig,
} from '../src/shared/contracts';

let activeProcess: ChildProcess | null = null;

function getBundledJavaPath(gameRoot: string) {
  const executableName = process.platform === 'win32' ? 'javaw.exe' : 'java';
  return path.join(gameRoot, 'runtime', 'java', 'bin', executableName);
}

function getFallbackJavaPath() {
  return process.platform === 'win32' ? 'javaw' : 'java';
}

export function isGameRunning() {
  return Boolean(activeProcess);
}

export async function launchMinecraft(options: {
  config: LauncherStaticConfig;
  settings: LauncherSettings;
  manifest: DistributionManifest;
  gameRoot: string;
  mainWindow: BrowserWindow;
  sendState: (state: LaunchStatePayload) => void;
}) {
  const {
    config,
    settings,
    manifest,
    gameRoot,
    mainWindow,
    sendState,
  } = options;

  if (activeProcess) {
    throw new Error('Игра уже запущена.');
  }

  const username = settings.username.trim();
  const uuid = getOfflineUUID(username);
  const auth = offline(username, uuid);
  const bundledJavaPath = getBundledJavaPath(gameRoot);
  const javaPath = await pathExists(bundledJavaPath)
    ? bundledJavaPath
    : getFallbackJavaPath();
  const canDirectConnect = config.minecraft.directConnectOnLaunch
    && Boolean(config.minecraft.server.host)
    && !config.minecraft.server.host.includes('example');

  sendState({
    phase: 'launching',
    message: 'Подготавливаем запуск клиента...',
  });

  const processHandle = await launch({
    gamePath: gameRoot,
    resourcePath: gameRoot,
    javaPath,
    version: manifest.versionId,
    minMemory: Math.min(
      config.minecraft.minimumLaunchRamMb,
      settings.allocatedRamMb,
    ),
    maxMemory: settings.allocatedRamMb,
    launcherName: 'Forge World Launcher',
    launcherBrand: 'Forge World',
    gameProfile: auth.selectedProfile,
    accessToken: auth.accessToken,
    userType: 'legacy',
    extraJVMArgs: [
      '-Dfile.encoding=UTF-8',
      '-XX:+UseG1GC',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:G1NewSizePercent=20',
      '-XX:G1ReservePercent=20',
      '-XX:MaxGCPauseMillis=50',
    ],
    server: canDirectConnect
      ? {
        ip: config.minecraft.server.host,
        port: config.minecraft.server.port,
      }
      : undefined,
    extraExecOption: {
      cwd: gameRoot,
      windowsHide: false,
    },
  });

  activeProcess = processHandle;

  if (settings.hideLauncherOnGameStart) {
    mainWindow.hide();
  }

  sendState({
    phase: 'running',
    message: 'Клиент запущен. Удачной игры.',
  });

  processHandle.once('close', () => {
    activeProcess = null;

    if (settings.hideLauncherOnGameStart && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }

    sendState({
      phase: 'idle',
      message: 'Клиент закрыт. Лаунчер готов к следующему запуску.',
    });

    if (settings.closeLauncherWhenGameCloses) {
      app.quit();
    }
  });

  processHandle.once('error', (error) => {
    activeProcess = null;

    if (settings.hideLauncherOnGameStart && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }

    sendState({
      phase: 'error',
      message: error.message,
    });
  });
}
