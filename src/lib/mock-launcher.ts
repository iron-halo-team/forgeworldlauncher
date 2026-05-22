import type {
  LauncherApi,
  LauncherBootstrap,
  LauncherSettings,
  LauncherUpdateInfo,
  ServerStatusPayload,
} from '../shared/contracts';

const mockConfig = {
  appId: 'forge-world-launcher',
  launcherVersion: '1.2.0',
  distributionVersion: '1.2.0',
  branding: {
    projectName: 'FORGE WORLD',
    subtitle: [
      'Средневековый гримдарк даркфэнтези сервер.',
      'Мир, где честь — редкость,',
      'а сила решает судьбы.',
    ],
    supportTitle: 'ПОДДЕРЖАТЬ ПРОЕКТ',
    supportText: 'Твоя поддержка помогает развивать сервер, улучшать контент и делать игру лучше.',
  },
  minecraft: {
    version: '1.21.1',
    neoForgeVersion: '21.1.229',
    defaultVersionId: 'neoforge-21.1.229',
    instanceFolderName: 'forge-world-instance',
    defaultRamMb: 6144,
    minimumRamMb: 3072,
    maximumRamMb: 16384,
    minimumLaunchRamMb: 2048,
    directConnectOnLaunch: true,
    server: {
      host: 'play.forgeworld.example',
      port: 25565,
      displayName: 'Forge World',
    },
  },
  links: {
    site: 'https://example.com',
    discord: 'https://discord.gg/your-server',
    wiki: 'https://example.com/wiki',
    github: 'https://github.com/your-org/forge-world-launcher',
    support: 'https://example.com/donate',
  },
  update: {
    metadataUrl: 'https://example.com/forge-world/update.json',
    downloadPage: 'https://example.com/forge-world/download',
  },
  auth: {
    enabled: true,
    baseUrl: 'http://hm507391.webhm.pro/forgeworld-auth',
    requestTimeoutMs: 30000,
  },
  preserveOnUpdate: ['options.txt'],
};

const mockContent = {
  newsTitle: 'НОВОСТИ',
  timelineTitle: 'ЛЕТОПИСЬ МИРА',
  timelineSubtitle: 'Исторические события',
  news: [
    {
      id: 'update-1-2-0',
      title: 'Обновление 1.2.0',
      date: '18.05.2024',
      text: 'Новые подземелья, переработка данжей и балансные правки.',
      icon: 'pickaxe',
      url: '',
    },
    {
      id: 'shadow-event',
      title: 'Ивент: Тень Варана',
      date: '12.05.2024',
      text: 'Мир окутала тьма. Соберите союзников и выстойте в грядущей буре.',
      icon: 'helm',
      url: '',
    },
    {
      id: 'northern-frontier',
      title: 'Новые территории',
      date: '04.05.2024',
      text: 'Исследуйте северные земли, полные опасностей и тайн.',
      icon: 'tower',
      url: '',
    },
    {
      id: 'southern-coast',
      title: 'Южное побережье',
      date: '29.04.2024',
      text: 'На карте появились новые маршруты, руины и поселения у тёплого моря.',
      icon: 'tower',
      url: '',
    },
  ],
  timeline: [
    {
      id: 'empire-fall',
      year: '1023 г. до н.э.',
      title: 'ПАДЕНИЕ ИМПЕРИИ',
      text: 'Великая Империя пала под натиском предательства и чумы. Мир погрузился в хаос и разруху.',
      icon: 'crown',
      url: '',
    },
    {
      id: 'liorka',
      year: '428 г. н.э.',
      title: 'ОСНОВАНИЕ ЛИОРКА',
      text: 'Беженцы и воины основали новый оплот цивилизации на берегах холодного моря.',
      icon: 'banner',
      url: '',
    },
    {
      id: 'coalition-war',
      year: '781 г. н.э.',
      title: 'ГРАЖДАНСКАЯ ВОЙНА КОАЛИЦИЙ',
      text: 'Амбиции и жадность привели к расколу. Братья восстали против братьев.',
      icon: 'crossed-blades',
      url: '',
    },
    {
      id: 'haimeit',
      year: '1022 г. н.э.',
      title: 'ОСНОВАНИЕ ХАЙМЕЙТА',
      text: 'На руинах старого мира возникла новая крепость — Хаймейт. Последний бастион свободы.',
      icon: 'cathedral',
      url: '',
    },
  ],
};

let mockSettings: LauncherSettings = {
  username: '',
  authToken: '',
  authTokenExpiresAt: '',
  allocatedRamMb: 6144,
  hideLauncherOnGameStart: true,
  closeLauncherWhenGameCloses: false,
  directConnectOnLaunch: true,
};

let launchState = {
  phase: 'idle',
  message: 'Предпросмотр интерфейса запущен в браузере.',
} as LauncherBootstrap['launchState'];

let serverStatus: ServerStatusPayload = {
  online: true,
  displayText: '1 346',
  playersOnline: 1346,
  maxPlayers: 2500,
  latencyMs: 24,
  players: ['IronWanderer', 'Runesmith', 'NorthGuard'],
};

let updateInfo: LauncherUpdateInfo | null = {
  latestVersion: '1.3.0',
  title: 'Вышла версия 1.3.0',
  notes: 'В этом режиме это демонстрационное уведомление для проверки блока обновлений.',
  downloadUrl: mockConfig.update.downloadPage,
};

const launchListeners = new Set<(payload: LauncherBootstrap['launchState']) => void>();
const serverListeners = new Set<(payload: ServerStatusPayload | null) => void>();
const updateListeners = new Set<(payload: LauncherUpdateInfo | null) => void>();
let mockApi: LauncherApi | null = null;

function emitLaunch() {
  launchListeners.forEach((listener) => listener(launchState));
}

export function getLauncherApi(): LauncherApi {
  if (typeof window !== 'undefined' && window.launcher) {
    return window.launcher;
  }

  if (mockApi) {
    return mockApi;
  }

  mockApi = {
    async getBootstrap() {
      return {
        config: mockConfig,
        content: mockContent,
        settings: mockSettings,
        distributionManifest: {
          distributionVersion: '1.2.0',
          launcherVersion: '1.2.0',
          minecraftVersion: '1.21.1',
          neoForgeVersion: '21.1.229',
          versionId: 'neoforge-21.1.229',
          builtAt: new Date().toISOString(),
        },
        gameDirectory: 'C:/Preview/forge-world-instance',
        userDataDirectory: 'C:/Preview',
        distributionReady: true,
        updateInfo,
        serverStatus,
        authStatus: {
          online: true,
          message: 'Сервер авторизации доступен.',
          checkedAt: new Date().toISOString(),
        },
        launchState,
      };
    },
    async saveSettings(patch) {
      mockSettings = {
        ...mockSettings,
        ...patch,
      };
      return mockSettings;
    },
    async loginAccount(username) {
      mockSettings = {
        ...mockSettings,
        username,
        authToken: 'preview-token',
        authTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
      return {
        ok: true,
        message: 'Вход выполнен.',
        settings: mockSettings,
        expiresAt: mockSettings.authTokenExpiresAt,
      };
    },
    async registerAccount(username) {
      mockSettings = {
        ...mockSettings,
        username,
        authToken: 'preview-token',
        authTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
      return {
        ok: true,
        message: 'Регистрация выполнена.',
        settings: mockSettings,
        expiresAt: mockSettings.authTokenExpiresAt,
      };
    },
    async logoutAccount() {
      mockSettings = {
        ...mockSettings,
        username: '',
        authToken: '',
        authTokenExpiresAt: '',
      };
      return mockSettings;
    },
    async getAccountProfile() {
      return {
        ok: true,
        message: 'Профиль загружен.',
        profile: {
          username: mockSettings.username,
          email: '',
          hasEmail: false,
          lastLoginAt: new Date().toISOString(),
        },
      };
    },
    async updateAccountEmail(email) {
      return {
        ok: true,
        message: 'Почта обновлена.',
        profile: {
          username: mockSettings.username,
          email,
          hasEmail: true,
          lastLoginAt: new Date().toISOString(),
        },
      };
    },
    async changeAccountPassword() {
      return {
        ok: true,
        message: 'Пароль изменен.',
      };
    },
    async startPasswordRecovery() {
      return {
        ok: false,
        message: 'К аккаунту не привязана почта. Для восстановления пароля обратитесь к администрации сервера.',
        hasEmail: false,
      };
    },
    async checkAuthStatus() {
      return {
        online: true,
        message: 'Сервер авторизации доступен.',
        checkedAt: new Date().toISOString(),
      };
    },
    async launchGame() {
      launchState = {
        phase: 'running',
        message: 'В браузерном предпросмотре запуск игры имитируется.',
      };
      emitLaunch();
    },
    async minimizeWindow() {},
    async toggleMaximizeWindow() {},
    async closeWindow() {},
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    async openGameFolder() {},
    async openLauncherDataFolder() {},
    async openSettingsFile() {},
    async refreshServerStatus() {
      serverListeners.forEach((listener) => listener(serverStatus));
      return serverStatus;
    },
    async checkForUpdates() {
      updateListeners.forEach((listener) => listener(updateInfo));
      return updateInfo;
    },
    onLaunchState(listener) {
      launchListeners.add(listener);
      return () => launchListeners.delete(listener);
    },
    onServerStatus(listener) {
      serverListeners.add(listener);
      return () => serverListeners.delete(listener);
    },
    onUpdateInfo(listener) {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
  };

  if (typeof window !== 'undefined') {
    window.launcher = mockApi;
  }

  return mockApi;
}
