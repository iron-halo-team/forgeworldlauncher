import path from 'node:path';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
} from 'electron';
import type {
  AuthServerStatusPayload,
  LaunchStatePayload,
  LauncherBootstrap,
  LauncherContent,
  LauncherStaticConfig,
  LauncherUpdateInfo,
  ServerStatusPayload,
} from '../src/shared/contracts';
import { IPC_CHANNELS } from '../src/shared/constants';
import {
  checkLauncherAuthStatus,
  changeLauncherAccountPassword,
  getLauncherAccountProfile,
  loginLauncherAccount,
  logoutLauncherAccount,
  prepareLauncherAuthSession,
  registerLauncherAccount,
  startLauncherPasswordRecovery,
  updateLauncherAccountEmail,
} from './auth-service';
import {
  readDistributionManifestFrom,
  syncBundledDistribution,
} from './distribution';
import { launchMinecraft } from './minecraft';
import {
  getGameRoot,
  getBundledDistributionDirectory,
  getLauncherLogPath,
  getSettingsPath,
  getUserDataRoot,
} from './paths';
import {
  loadSettings,
  saveSettings,
} from './settings-store';
import { fetchServerStatus } from './server-status';
import {
  parseLauncherContent,
  readLauncherContent,
  readStaticConfig,
} from './static-data';
import { fetchAvailableUpdate } from './update-check';

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173';

let mainWindow: BrowserWindow | null = null;
let launchState: LaunchStatePayload = {
  phase: 'idle',
  message: 'Лаунчер готов к запуску.',
};
let lastServerStatus: ServerStatusPayload | null = null;
let lastUpdateInfo: LauncherUpdateInfo | null = null;
let lastAuthStatus: AuthServerStatusPayload | null = null;
let lastLauncherContent: LauncherContent | null = null;
let statusInterval: NodeJS.Timeout | null = null;
let contentInterval: NodeJS.Timeout | null = null;
let isStatusRefreshRunning = false;
let isContentRefreshRunning = false;
let serverStatusFailureCount = 0;
let authStatusFailureCount = 0;
let lastServerOnlineAt = 0;
let lastAuthOnlineAt = 0;
let lastContentFetchErrorAt = 0;
let lastGitHubContentEtag = '';

function writeLog(level: 'INFO' | 'ERROR', message: string, error?: unknown) {
  try {
    const logPath = getLauncherLogPath();
    const logDirectory = path.dirname(logPath);
    if (!existsSync(logDirectory)) {
      mkdirSync(logDirectory, { recursive: true });
    }

    const details = error instanceof Error
      ? `${error.stack ?? error.message}`
      : error
        ? String(error)
        : '';
    const line = `[${new Date().toISOString()}] [${level}] ${message}${details ? `\n${details}` : ''}\n`;
    appendFileSync(logPath, line, 'utf8');
  } catch {
    // Logging should never crash the launcher.
  }
}

function getRendererEntryPath() {
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function getWindowIconPath() {
  return path.join(app.getAppPath(), 'ico', 'forgeworld_multisize.ico');
}

function reportFatalError(message: string, error?: unknown) {
  writeLog('ERROR', message, error);

  const detail = error instanceof Error
    ? error.stack ?? error.message
    : error
      ? String(error)
      : '';

  dialog.showErrorBox(
    'Forge World Launcher',
    `${message}\n\nПодробности: ${detail || 'смотрите launcher.log в папке данных лаунчера.'}`,
  );
}

function broadcast(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setLaunchState(nextState: LaunchStatePayload) {
  launchState = nextState;
  broadcast(IPC_CHANNELS.launchState, nextState);
}

function withFallback<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  return new Promise<T>((resolve) => {
    const timeout = setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timeout));
  });
}

async function loadBootstrap(): Promise<LauncherBootstrap> {
  const [config, localContent] = await Promise.all([
    readStaticConfig(),
    readLauncherContent(),
  ]);
  if (!lastLauncherContent) {
    lastLauncherContent = localContent;
  }
  const settings = await loadSettings(config);
  const bundledDistributionDirectory = getBundledDistributionDirectory();
  const bundledManifest = await readDistributionManifestFrom(bundledDistributionDirectory);
  const gameRoot = getGameRoot(config);

  writeLog(
    'INFO',
    bundledManifest
      ? `Bundled distribution found in ${bundledDistributionDirectory}: ${bundledManifest.distributionVersion} (${bundledManifest.versionId})`
      : `Bundled distribution manifest is missing in ${bundledDistributionDirectory}`,
  );

  return {
    config,
    content: lastLauncherContent,
    settings,
    distributionManifest: bundledManifest,
    gameDirectory: gameRoot,
    userDataDirectory: getUserDataRoot(),
    distributionReady: Boolean(bundledManifest),
    updateInfo: lastUpdateInfo,
    serverStatus: lastServerStatus,
    authStatus: lastAuthStatus,
    launchState,
  };
}

function getCacheBustedUrl(url: string) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set('_fw', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return nextUrl.toString();
}

async function fetchRemoteLauncherContent(config: LauncherStaticConfig) {
  const remoteUrl = config.content.remoteUrl.trim();

  const githubApiUrl = getGitHubContentApiUrl(remoteUrl);
  if (githubApiUrl) {
    return fetchRemoteLauncherContentFromGitHub(githubApiUrl, remoteUrl);
  }

  return fetchRemoteLauncherContentFromUrl(remoteUrl);
}

function getGitHubContentApiUrl(remoteUrl: string) {
  try {
    const parsedUrl = new URL(remoteUrl);
    if (parsedUrl.hostname !== 'raw.githubusercontent.com') {
      return null;
    }

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathParts.length < 4) {
      return null;
    }

    const [owner, repo, ref, ...filePathParts] = pathParts;
    const filePath = filePathParts.map((part) => encodeURIComponent(part)).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
  } catch {
    return null;
  }
}

async function fetchRemoteLauncherContentFromGitHub(apiUrl: string, fallbackRawUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'ForgeWorldLauncher',
      'x-github-api-version': '2022-11-28',
    };

    if (lastGitHubContentEtag) {
      headers['if-none-match'] = lastGitHubContentEtag;
    }

    const response = await fetch(apiUrl, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 304) {
      return null;
    }

    if (!response.ok) {
      return fetchRemoteLauncherContentFromUrl(fallbackRawUrl);
    }

    const responseEtag = response.headers.get('etag');
    if (responseEtag) {
      lastGitHubContentEtag = responseEtag;
    }

    const payload = await response.json() as {
      content?: string;
      encoding?: string;
      type?: string;
    };

    if (payload.type !== 'file' || payload.encoding !== 'base64' || !payload.content) {
      throw new Error('GitHub content response does not contain a base64 file.');
    }

    const responseText = Buffer
      .from(payload.content.replace(/\s/g, ''), 'base64')
      .toString('utf8');

    return parseLauncherContent(parseRemoteContentJson(responseText));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteLauncherContentFromUrl(remoteUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(getCacheBustedUrl(remoteUrl), {
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'ForgeWorldLauncher',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Content request failed: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    return parseLauncherContent(parseRemoteContentJson(responseText));
  } finally {
    clearTimeout(timeout);
  }
}

function parseRemoteContentJson(responseText: string) {
  const normalizedText = responseText.replace(/^\uFEFF/, '');

  try {
    return JSON.parse(normalizedText) as unknown;
  } catch {
    return JSON.parse(escapeLineBreaksInsideJsonStrings(normalizedText)) as unknown;
  }
}

function escapeLineBreaksInsideJsonStrings(responseText: string) {
  let result = '';
  let isInsideString = false;
  let isEscaping = false;

  for (let index = 0; index < responseText.length; index += 1) {
    const character = responseText[index];

    if (!isInsideString) {
      if (character === '"') {
        isInsideString = true;
      }

      result += character;
      continue;
    }

    if (isEscaping) {
      result += character;
      isEscaping = false;
      continue;
    }

    if (character === '\\') {
      result += character;
      isEscaping = true;
      continue;
    }

    if (character === '"') {
      result += character;
      isInsideString = false;
      continue;
    }

    if (character === '\r') {
      if (responseText[index + 1] === '\n') {
        index += 1;
      }
      result += '\\n';
      continue;
    }

    if (character === '\n') {
      result += '\\n';
      continue;
    }

    result += character;
  }

  return result;
}

async function refreshLauncherContent(config: LauncherStaticConfig) {
  if (isContentRefreshRunning) {
    return;
  }

  isContentRefreshRunning = true;
  try {
    const remoteContent = await fetchRemoteLauncherContent(config);
    if (!remoteContent) {
      return;
    }

    const currentSignature = JSON.stringify(lastLauncherContent);
    const nextSignature = JSON.stringify(remoteContent);

    if (currentSignature === nextSignature) {
      return;
    }

    lastLauncherContent = remoteContent;
    broadcast(IPC_CHANNELS.contentUpdate, remoteContent);
    lastContentFetchErrorAt = 0;
    writeLog('INFO', `Launcher content updated from ${config.content.remoteUrl}`);
  } catch (error) {
    const now = Date.now();
    if (!lastContentFetchErrorAt || now - lastContentFetchErrorAt > 60_000) {
      lastContentFetchErrorAt = now;
      writeLog('INFO', 'Remote launcher content was not updated; bundled content remains active.', error);
    }
  } finally {
    isContentRefreshRunning = false;
  }
}

function stabilizeServerStatus(nextStatus: ServerStatusPayload | null): ServerStatusPayload | null {
  const now = Date.now();

  if (nextStatus?.online) {
    serverStatusFailureCount = 0;
    lastServerOnlineAt = now;
    return nextStatus;
  }

  serverStatusFailureCount += 1;
  if (
    lastServerStatus?.online
    && lastServerOnlineAt > 0
    && now - lastServerOnlineAt < 90_000
    && serverStatusFailureCount < 4
  ) {
    return {
      ...lastServerStatus,
      error: 'Сервер отвечает нестабильно, статус перепроверяется...',
    };
  }

  return nextStatus;
}

function stabilizeAuthStatus(nextStatus: AuthServerStatusPayload): AuthServerStatusPayload {
  const now = Date.now();

  if (nextStatus.online) {
    authStatusFailureCount = 0;
    lastAuthOnlineAt = now;
    return nextStatus;
  }

  authStatusFailureCount += 1;
  if (
    lastAuthStatus?.online
    && lastAuthOnlineAt > 0
    && now - lastAuthOnlineAt < 90_000
    && authStatusFailureCount < 4
  ) {
    return {
      ...lastAuthStatus,
      checkedAt: nextStatus.checkedAt,
      message: 'Сервер авторизации перепроверяется...',
    };
  }

  return nextStatus;
}

async function refreshAuthStatus(config: LauncherStaticConfig) {
  const fallbackAuthStatus: AuthServerStatusPayload = {
    online: false,
    message: 'Сервер авторизации сейчас недоступен.',
    checkedAt: new Date().toISOString(),
  };

  const nextStatus = await withFallback(
    checkLauncherAuthStatus(config),
    fallbackAuthStatus,
    6000,
  );

  lastAuthStatus = stabilizeAuthStatus(nextStatus);
  return lastAuthStatus;
}

async function refreshStatusAndUpdates(config: LauncherStaticConfig) {
  if (isStatusRefreshRunning) {
    return;
  }

  isStatusRefreshRunning = true;
  const fallbackServerStatus: ServerStatusPayload = {
    online: false,
    displayText: 'OFFLINE',
    error: 'Не удалось получить статус сервера.',
  };

  try {
    const [serverStatus, updateInfo] = await Promise.all([
      withFallback(fetchServerStatus(config), fallbackServerStatus, 7000),
      withFallback(fetchAvailableUpdate(config), null, 5000),
      refreshAuthStatus(config),
    ]);

    lastServerStatus = stabilizeServerStatus(serverStatus);
    lastUpdateInfo = updateInfo;

    broadcast(IPC_CHANNELS.serverStatus, lastServerStatus);
    broadcast(IPC_CHANNELS.updateInfo, updateInfo);
  } finally {
    isStatusRefreshRunning = false;
  }
}

async function startBackgroundRefresh(config: LauncherStaticConfig) {
  if (statusInterval) {
    clearInterval(statusInterval);
  }

  void refreshStatusAndUpdates(config);
  statusInterval = setInterval(() => {
    void refreshStatusAndUpdates(config);
  }, 5_000);
}

async function startContentRefresh(config: LauncherStaticConfig) {
  if (contentInterval) {
    clearInterval(contentInterval);
  }

  void refreshLauncherContent(config);
  contentInterval = setInterval(() => {
    void refreshLauncherContent(config);
  }, Math.max(3_000, config.content.checkIntervalMs));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getWindowBounds() {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const maxWidth = Math.max(820, workAreaWidth - 24);
  const maxHeight = Math.max(640, workAreaHeight - 24);
  const minWidth = Math.min(maxWidth, 1120);
  const minHeight = Math.min(maxHeight, 700);
  const width = clamp(Math.floor(workAreaWidth * 0.94), minWidth, Math.min(maxWidth, 1380));
  const height = clamp(Math.floor(workAreaHeight * 0.9), minHeight, Math.min(maxHeight, 840));

  return {
    width,
    height,
    minWidth,
    minHeight,
  };
}

function createWindow() {
  const bounds = getWindowBounds();
  writeLog('INFO', `Opening window ${bounds.width}x${bounds.height} (min ${bounds.minWidth}x${bounds.minHeight})`);

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    frame: false,
    center: true,
    backgroundColor: '#070b10',
    title: 'Forge World Launcher',
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (app.isPackaged) {
    const rendererEntryPath = getRendererEntryPath();
    writeLog('INFO', `Loading packaged renderer from ${rendererEntryPath}`);
    void mainWindow.loadFile(rendererEntryPath);
  } else {
    void mainWindow.loadURL(DEV_SERVER_URL);
  }

  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('INFO', 'Renderer finished loading.');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    reportFatalError(
      `Не удалось загрузить интерфейс лаунчера (${validatedUrl || 'локальный файл'}).`,
      new Error(`${errorCode}: ${errorDescription}`),
    );
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(
      level >= 2 ? 'ERROR' : 'INFO',
      `Renderer console [${sourceId}:${line}] ${message}`,
    );
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog('ERROR', `Renderer process exited: ${details.reason} (code ${details.exitCode})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.bootstrap, async () => {
    const bootstrap = await loadBootstrap();
    void startBackgroundRefresh(bootstrap.config);
    void startContentRefresh(bootstrap.config);
    return bootstrap;
  });

  ipcMain.handle(IPC_CHANNELS.saveSettings, async (_event, patch) => {
    const config = await readStaticConfig();
    return saveSettings(config, patch);
  });

  ipcMain.handle(IPC_CHANNELS.loginAccount, async (_event, username: string, password: string) => {
    const config = await readStaticConfig();
    const result = await loginLauncherAccount(config, username.trim(), password);
    const settings = await saveSettings(config, {
      username: result.username,
      authToken: result.token ?? '',
      authTokenExpiresAt: result.expiresAt ?? '',
    });

    return {
      ok: result.ok,
      message: result.message,
      settings,
      expiresAt: result.expiresAt,
    };
  });

  ipcMain.handle(IPC_CHANNELS.registerAccount, async (_event, username: string, password: string, email?: string) => {
    const config = await readStaticConfig();
    const result = await registerLauncherAccount(config, username.trim(), password, email);
    const settings = await saveSettings(config, {
      username: result.username,
      authToken: result.token ?? '',
      authTokenExpiresAt: result.expiresAt ?? '',
    });

    return {
      ok: result.ok,
      message: result.message,
      settings,
      expiresAt: result.expiresAt,
    };
  });

  ipcMain.handle(IPC_CHANNELS.logoutAccount, async () => {
    const config = await readStaticConfig();
    const settings = await loadSettings(config);
    await logoutLauncherAccount(config, settings.username, settings.authToken)
      .catch(() => undefined);

    return saveSettings(config, {
      username: '',
      authToken: '',
      authTokenExpiresAt: '',
    });
  });

  ipcMain.handle(IPC_CHANNELS.getAccountProfile, async () => {
    const config = await readStaticConfig();
    const settings = await loadSettings(config);
    return getLauncherAccountProfile(config, settings.username, settings.authToken);
  });

  ipcMain.handle(IPC_CHANNELS.updateAccountEmail, async (_event, email: string) => {
    const config = await readStaticConfig();
    const settings = await loadSettings(config);
    return updateLauncherAccountEmail(config, settings.username, settings.authToken, email);
  });

  ipcMain.handle(IPC_CHANNELS.changeAccountPassword, async (_event, currentPassword: string, newPassword: string) => {
    const config = await readStaticConfig();
    const settings = await loadSettings(config);
    return changeLauncherAccountPassword(
      config,
      settings.username,
      settings.authToken,
      currentPassword,
      newPassword,
    );
  });

  ipcMain.handle(IPC_CHANNELS.startPasswordRecovery, async (_event, username: string) => {
    const config = await readStaticConfig();
    return startLauncherPasswordRecovery(config, username.trim());
  });

  ipcMain.handle(IPC_CHANNELS.checkAuthStatus, async () => {
    const config = await readStaticConfig();
    return refreshAuthStatus(config);
  });

  ipcMain.handle(IPC_CHANNELS.launchGame, async () => {
    if (!mainWindow) {
      throw new Error('Окно лаунчера недоступно.');
    }

    const config = await readStaticConfig();
    const settings = await loadSettings(config);

    if (config.auth.enabled) {
      if (!settings.username.trim() || !settings.authToken) {
        throw new Error('Войдите в аккаунт Forge World перед запуском игры.');
      }

      setLaunchState({
        phase: 'syncing',
        message: 'Готовим вход на сервер...',
      });

      await prepareLauncherAuthSession(
        config,
        settings.username.trim(),
        settings.authToken,
      );
    }

    setLaunchState({
      phase: 'syncing',
      message: 'Проверяем локальную сборку...',
    });

    const distribution = await syncBundledDistribution(config);
    if (!distribution.ready || !distribution.manifest) {
      setLaunchState({
        phase: 'error',
        message: 'Офлайн-сборка не подготовлена. Выполните npm run prepare:distribution.',
      });
      throw new Error('Bundled distribution is missing.');
    }

    await launchMinecraft({
      config,
      settings,
      manifest: distribution.manifest,
      gameRoot: distribution.gameRoot,
      mainWindow,
      sendState: setLaunchState,
    });
  });

  ipcMain.handle(IPC_CHANNELS.minimizeWindow, async () => {
    mainWindow?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, async () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.closeWindow, async () => {
    app.quit();
  });

  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.openGameFolder, async () => {
    const config = await readStaticConfig();
    await shell.openPath(getGameRoot(config));
  });

  ipcMain.handle(IPC_CHANNELS.openModsFolder, async () => {
    const config = await readStaticConfig();
    const modsPath = path.join(getGameRoot(config), 'mods');

    if (!existsSync(modsPath)) {
      mkdirSync(modsPath, { recursive: true });
    }

    await shell.openPath(modsPath);
  });

  ipcMain.handle(IPC_CHANNELS.openLauncherDataFolder, async () => {
    await shell.openPath(getUserDataRoot());
  });

  ipcMain.handle(IPC_CHANNELS.openSettingsFile, async () => {
    await shell.openPath(getSettingsPath());
  });

  ipcMain.handle(IPC_CHANNELS.refreshServerStatus, async () => {
    const config = await readStaticConfig();
    lastServerStatus = await fetchServerStatus(config);
    broadcast(IPC_CHANNELS.serverStatus, lastServerStatus);
    return lastServerStatus;
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async () => {
    const config = await readStaticConfig();
    lastUpdateInfo = await fetchAvailableUpdate(config);
    broadcast(IPC_CHANNELS.updateInfo, lastUpdateInfo);
    return lastUpdateInfo;
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId('forge-world-launcher');
  writeLog('INFO', 'Launcher startup');
  await registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
  if (contentInterval) {
    clearInterval(contentInterval);
    contentInterval = null;
  }
});

process.on('uncaughtException', (error) => {
  reportFatalError('Лаунчер завершился из-за неперехваченной ошибки.', error);
});

process.on('unhandledRejection', (error) => {
  reportFatalError('Лаунчер получил необработанную ошибку.', error);
});
