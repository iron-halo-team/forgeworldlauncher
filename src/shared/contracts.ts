export type SidebarView = 'home' | 'settings' | 'login' | 'register' | 'profile';

export interface LauncherStaticConfig {
  appId: string;
  launcherVersion: string;
  distributionVersion: string;
  branding: {
    projectName: string;
    subtitle: string[];
    supportTitle?: string;
    supportText?: string;
  };
  minecraft: {
    version: string;
    neoForgeVersion: string;
    defaultVersionId: string;
    instanceFolderName: string;
    defaultRamMb: number;
    minimumRamMb: number;
    maximumRamMb: number;
    minimumLaunchRamMb: number;
    directConnectOnLaunch: boolean;
    server: {
      host: string;
      port: number;
      displayName: string;
    };
  };
  links: {
    site?: string;
    discord: string;
    wiki: string;
    github: string;
    support?: string;
  };
  update: {
    metadataUrl: string;
    downloadPage: string;
  };
  content: {
    remoteUrl: string;
    checkIntervalMs: number;
  };
  auth: {
    enabled: boolean;
    baseUrl: string;
    fallbackBaseUrl?: string;
    hostHeader?: string;
    requestTimeoutMs: number;
  };
  preserveOnUpdate: string[];
}

export interface LauncherNewsItem {
  id: string;
  title: string;
  date: string;
  text: string;
  icon?: string;
  url?: string;
}

export interface LauncherTimelineItem {
  id: string;
  year: string;
  title: string;
  text: string;
  icon: string;
  url?: string;
}

export interface LauncherContent {
  newsTitle: string;
  timelineTitle: string;
  timelineSubtitle: string;
  news: LauncherNewsItem[];
  timeline: LauncherTimelineItem[];
}

export interface LauncherSettings {
  username: string;
  authToken: string;
  authTokenExpiresAt: string;
  allocatedRamMb: number;
  hideLauncherOnGameStart: boolean;
  closeLauncherWhenGameCloses: boolean;
  directConnectOnLaunch: boolean;
}

export interface AuthServerStatusPayload {
  online: boolean;
  message: string;
  checkedAt: string;
}

export interface LauncherAuthResult {
  ok: boolean;
  message: string;
  settings: LauncherSettings;
  expiresAt?: string;
}

export interface LauncherAccountProfile {
  username: string;
  email: string;
  hasEmail: boolean;
  lastLoginAt: string;
}

export interface LauncherAccountProfileResult {
  ok: boolean;
  message: string;
  profile: LauncherAccountProfile;
}

export interface DistributionManifest {
  distributionVersion: string;
  launcherVersion: string;
  minecraftVersion: string;
  neoForgeVersion: string;
  versionId: string;
  builtAt: string;
}

export interface LauncherUpdateInfo {
  latestVersion: string;
  title?: string;
  notes?: string;
  publishedAt?: string;
  downloadUrl?: string;
}

export interface LaunchStatePayload {
  phase: 'idle' | 'syncing' | 'launching' | 'running' | 'error';
  message: string;
}

export interface ServerStatusPayload {
  online: boolean;
  displayText: string;
  playersOnline?: number;
  maxPlayers?: number;
  latencyMs?: number;
  players?: string[];
  error?: string;
}

export interface LauncherBootstrap {
  config: LauncherStaticConfig;
  content: LauncherContent;
  settings: LauncherSettings;
  distributionManifest: DistributionManifest | null;
  gameDirectory: string;
  userDataDirectory: string;
  distributionReady: boolean;
  updateInfo: LauncherUpdateInfo | null;
  serverStatus: ServerStatusPayload | null;
  authStatus: AuthServerStatusPayload | null;
  launchState: LaunchStatePayload;
}

export interface LauncherApi {
  getBootstrap(): Promise<LauncherBootstrap>;
  saveSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings>;
  loginAccount(username: string, password: string): Promise<LauncherAuthResult>;
  registerAccount(username: string, password: string, email?: string): Promise<LauncherAuthResult>;
  logoutAccount(): Promise<LauncherSettings>;
  getAccountProfile(): Promise<LauncherAccountProfileResult>;
  updateAccountEmail(email: string): Promise<LauncherAccountProfileResult>;
  changeAccountPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; message: string }>;
  startPasswordRecovery(username: string): Promise<{ ok: boolean; message: string; hasEmail?: boolean }>;
  checkAuthStatus(): Promise<AuthServerStatusPayload>;
  launchGame(): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  openExternal(url: string): Promise<void>;
  openGameFolder(): Promise<void>;
  openModsFolder(): Promise<void>;
  openLauncherDataFolder(): Promise<void>;
  openSettingsFile(): Promise<void>;
  refreshServerStatus(): Promise<ServerStatusPayload | null>;
  checkForUpdates(): Promise<LauncherUpdateInfo | null>;
  onLaunchState(listener: (payload: LaunchStatePayload) => void): () => void;
  onServerStatus(listener: (payload: ServerStatusPayload | null) => void): () => void;
  onUpdateInfo(listener: (payload: LauncherUpdateInfo | null) => void): () => void;
  onContentUpdate(listener: (payload: LauncherContent) => void): () => void;
}
