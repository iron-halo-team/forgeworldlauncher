"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGameRunning = isGameRunning;
exports.launchMinecraft = launchMinecraft;
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const core_1 = require("@xmcl/core");
const user_1 = require("@xmcl/user");
const fs_extra_1 = require("fs-extra");
let activeProcess = null;
function getBundledJavaPath(gameRoot) {
    const executableName = process.platform === 'win32' ? 'javaw.exe' : 'java';
    return node_path_1.default.join(gameRoot, 'runtime', 'java', 'bin', executableName);
}
function getFallbackJavaPath() {
    return process.platform === 'win32' ? 'javaw' : 'java';
}
function isGameRunning() {
    return Boolean(activeProcess);
}
async function launchMinecraft(options) {
    const { config, settings, manifest, gameRoot, mainWindow, sendState, } = options;
    if (activeProcess) {
        throw new Error('Игра уже запущена.');
    }
    const username = settings.username.trim();
    if (!username) {
        throw new Error('Укажите имя игрока во вкладке входа.');
    }
    const uuid = (0, user_1.getOfflineUUID)(username);
    const auth = (0, user_1.offline)(username, uuid);
    const bundledJavaPath = getBundledJavaPath(gameRoot);
    const javaPath = await (0, fs_extra_1.pathExists)(bundledJavaPath)
        ? bundledJavaPath
        : getFallbackJavaPath();
    const canDirectConnect = config.minecraft.directConnectOnLaunch
        && Boolean(config.minecraft.server.host)
        && !config.minecraft.server.host.includes('example');
    sendState({
        phase: 'launching',
        message: 'Подготавливаем запуск клиента...',
    });
    const processHandle = await (0, core_1.launch)({
        gamePath: gameRoot,
        resourcePath: gameRoot,
        javaPath,
        version: manifest.versionId,
        minMemory: Math.min(config.minecraft.minimumLaunchRamMb, settings.allocatedRamMb),
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
        quickPlayMultiplayer: canDirectConnect
            ? (0, core_1.createQuickPlayMultiplayer)(config.minecraft.server.host, config.minecraft.server.port)
            : undefined,
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
            electron_1.app.quit();
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
