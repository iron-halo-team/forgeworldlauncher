import { useEffect, useState, useTransition } from 'react';
import discordIcon from './assets/discord.png';
import launchMenuClosedIcon from './assets/down.png';
import githubIcon from './assets/github.png';
import loreBookIcon from './assets/history/book_06g.png';
import heroScene from './assets/hero-scene.png';
import launchMenuOpenIcon from './assets/up.png';
import wikiIcon from './assets/wiki.png';
import { AuthDialog } from './components/AuthDialog';
import { NewsPanel } from './components/NewsPanel';
import { Sidebar } from './components/Sidebar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TimelineRail } from './components/TimelineRail';
import { WindowControls } from './components/WindowControls';
import { getLauncherApi } from './lib/mock-launcher';
import type {
  AuthServerStatusPayload,
  LauncherAccountProfile,
  LaunchStatePayload,
  LauncherApi,
  LauncherBootstrap,
  LauncherSettings,
  SidebarView,
} from './shared/contracts';

function getPlayLabel(launchState: LaunchStatePayload) {
  switch (launchState.phase) {
    case 'syncing':
      return 'ПОДГОТОВКА';
    case 'launching':
      return 'ЗАПУСК';
    case 'running':
      return 'ИГРА ЗАПУЩЕНА';
    default:
      return 'ИГРАТЬ';
  }
}

export function App() {
  const [launcher] = useState<LauncherApi>(() => getLauncherApi());
  const [bootstrap, setBootstrap] = useState<LauncherBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState('');
  const [selectedView, setSelectedView] = useState<SidebarView>('home');
  const [authStatus, setAuthStatus] = useState<AuthServerStatusPayload | null>(null);
  const [accountProfile, setAccountProfile] = useState<LauncherAccountProfile | null>(null);
  const [isLaunchMenuOpen, setIsLaunchMenuOpen] = useState(false);
  const [isPlayersPopupOpen, setIsPlayersPopupOpen] = useState(false);
  const [isBusy, startTransition] = useTransition();
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void launcher.getBootstrap()
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setBootstrap(data);
        setAuthStatus(data.authStatus);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setBootstrapError(error instanceof Error
          ? error.message
          : 'Не удалось загрузить данные лаунчера.');
      });

    const unsubscribeLaunch = launcher.onLaunchState((payload) => {
      setBootstrap((current) => current ? {
        ...current,
        launchState: payload,
      } : current);

      if (payload.phase !== 'launching' && payload.phase !== 'syncing') {
        setIsLaunching(false);
      }
    });

    const unsubscribeServer = launcher.onServerStatus((payload) => {
      setBootstrap((current) => current ? {
        ...current,
        serverStatus: payload,
      } : current);
    });

    const unsubscribeUpdate = launcher.onUpdateInfo((payload) => {
      setBootstrap((current) => current ? {
        ...current,
        updateInfo: payload,
      } : current);
    });

    const unsubscribeContent = launcher.onContentUpdate((payload) => {
      setBootstrap((current) => current ? {
        ...current,
        content: payload,
      } : current);
    });

    return () => {
      isMounted = false;
      unsubscribeLaunch();
      unsubscribeServer();
      unsubscribeUpdate();
      unsubscribeContent();
    };
  }, [launcher]);

  useEffect(() => {
    if (!bootstrap?.config.auth.enabled) {
      return undefined;
    }

    let isMounted = true;
    const refreshAuthStatus = () => {
      void launcher.checkAuthStatus()
        .then((status) => {
          if (isMounted) {
            setAuthStatus(status);
          }
        });
    };

    refreshAuthStatus();
    const interval = setInterval(refreshAuthStatus, 15_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [bootstrap?.config.auth.enabled, bootstrap?.config.auth.baseUrl, launcher]);

  if (!bootstrap && bootstrapError) {
    return (
      <main className="launcher-shell">
        <div className="loading-screen">
          <div className="loading-card">
            <span className="eyebrow loading-eyebrow">Forge World</span>
            <h1>Ошибка загрузки</h1>
            <p>{bootstrapError}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="launcher-shell">
        <div className="loading-screen">
          <div className="loading-card">
            <span className="eyebrow loading-eyebrow">Forge World</span>
            <h1>Загрузка...</h1>
          </div>
        </div>
      </main>
    );
  }

  const {
    config,
    content,
    settings,
    serverStatus,
    updateInfo,
    distributionReady,
    launchState,
  } = bootstrap;

  const applySettings = (nextSettings: LauncherSettings) => {
    startTransition(() => {
      setBootstrap((current) => current ? {
        ...current,
        settings: nextSettings,
      } : current);
    });
  };

  const saveSettingsPatch = (patch: Partial<LauncherSettings>) => {
    return launcher.saveSettings(patch).then((nextSettings) => {
      applySettings(nextSettings);
      return nextSettings;
    });
  };

  const loginAccount = async (username: string, password: string) => {
    const result = await launcher.loginAccount(username.trim(), password);
    applySettings(result.settings);
    setAccountProfile(null);
    setSelectedView('home');
  };

  const registerAccount = async (username: string, password: string, email?: string) => {
    const result = await launcher.registerAccount(username.trim(), password, email);
    applySettings(result.settings);
    setAccountProfile(null);
    setSelectedView('home');
  };

  const logoutAccount = async () => {
    const nextSettings = await launcher.logoutAccount();
    applySettings(nextSettings);
    setAccountProfile(null);
    setSelectedView('home');
  };

  const refreshAccountProfile = async () => {
    if (!settings.username.trim() || !settings.authToken) {
      setAccountProfile(null);
      return;
    }

    const result = await launcher.getAccountProfile();
    setAccountProfile(result.profile);
  };

  const updateAccountEmail = async (email: string) => {
    const result = await launcher.updateAccountEmail(email);
    setAccountProfile(result.profile);
  };

  const changeAccountPassword = async (currentPassword: string, newPassword: string) => {
    await launcher.changeAccountPassword(currentPassword, newPassword);
  };

  const recoverPassword = async (username: string) => {
    const result = await launcher.startPasswordRecovery(username);
    return result.message;
  };

  const launchGame = async () => {
    setIsLaunching(true);

    try {
      if (config.auth.enabled && (!settings.username.trim() || !settings.authToken)) {
        setSelectedView('login');
        throw new Error('Войдите или зарегистрируйтесь перед запуском игры.');
      }

      await launcher.launchGame();
    } catch (error) {
      setIsLaunching(false);
      setBootstrap((current) => current ? {
        ...current,
        launchState: {
          phase: 'error',
          message: error instanceof Error
            ? error.message
            : 'Не удалось запустить игру.',
        },
      } : current);
    }
  };

  const playDisabled = !distributionReady
    || isLaunching
    || launchState.phase === 'launching'
    || launchState.phase === 'syncing'
    || launchState.phase === 'running';
  const isAuthDialogOpen = selectedView === 'login'
    || selectedView === 'register'
    || selectedView === 'profile';

  return (
    <main className="launcher-shell">
      <div className="window-frame" />

      <header className="window-header">
        <div className="window-drag-region" />
        <WindowControls />
      </header>

      <div className={`auth-status-indicator ${authStatus?.online ? 'is-online' : 'is-offline'}`}>
        <span />
        <strong>{authStatus?.online ? 'ONLINE' : 'OFFLINE'}</strong>
      </div>

      <div className="launcher-grid">
        <Sidebar
          config={config}
          settings={settings}
          serverStatus={serverStatus}
          selectedView={selectedView}
          onSelectView={setSelectedView}
          onOpenPlayers={() => setIsPlayersPopupOpen(true)}
        />

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Launcher</span>
            <h1>{config.branding.projectName}</h1>
            <div className="hero-divider" />

            <div className="hero-subtitle">
              {config.branding.subtitle.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            {updateInfo ? (
              <div className="update-banner">
                <strong>{updateInfo.title ?? `Вышла версия ${updateInfo.latestVersion}`}</strong>
                {updateInfo.notes ? <p>{updateInfo.notes}</p> : null}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void launcher.openExternal(updateInfo.downloadUrl ?? config.update.downloadPage)}
                >
                  Скачать обновление
                </button>
              </div>
            ) : null}

            {!distributionReady ? (
              <div className="error-banner">
                <strong>Сборка ещё не упакована.</strong>
                <p>Сначала выполните `npm run prepare:distribution`, затем соберите релиз.</p>
              </div>
            ) : null}

            <div className="play-row">
              <button
                type="button"
                className="play-button"
                disabled={playDisabled}
                onClick={() => void launchGame()}
              >
                <span>{getPlayLabel(launchState)}</span>
              </button>

              <div className="launch-options">
                <button
                  type="button"
                  className="launch-options-button"
                  aria-label="Параметры запуска"
                  aria-expanded={isLaunchMenuOpen}
                  onClick={() => setIsLaunchMenuOpen((current) => !current)}
                >
                  <img
                    className="launch-options-icon"
                    src={isLaunchMenuOpen ? launchMenuOpenIcon : launchMenuClosedIcon}
                    alt=""
                  />
                </button>
                {isLaunchMenuOpen ? (
                  <div className="launch-options-popover">
                    <div className="launch-options-toggle-row">
                      <span>Прямое подключение</span>
                      <button
                        type="button"
                        className={`switch-button ${settings.directConnectOnLaunch ? 'is-on' : 'is-off'}`}
                        aria-label={settings.directConnectOnLaunch ? 'Отключить прямое подключение' : 'Включить прямое подключение'}
                        onClick={() => void saveSettingsPatch({
                          directConnectOnLaunch: !settings.directConnectOnLaunch,
                        })}
                      >
                        <span />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="launch-options-folder-button"
                      onClick={() => void launcher.openModsFolder()}
                    >
                      папка mods
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {isLaunching && (launchState.phase === 'syncing' || launchState.phase === 'launching') ? (
              <div className={`launch-status ${launchState.phase}`}>
                {launchState.message}
              </div>
            ) : null}

            <div className="hero-footer-bar">
              <div className="hero-socials">
                <button
                  type="button"
                  className="hero-social-button"
                  aria-label="Discord"
                  onClick={() => void launcher.openExternal(config.links.discord)}
                >
                  <img className="hero-social-icon" src={discordIcon} alt="" />
                </button>
                <button
                  type="button"
                  className="hero-social-button"
                  aria-label="Wiki проекта"
                  onClick={() => void launcher.openExternal(config.links.wiki)}
                >
                  <img className="hero-social-icon" src={wikiIcon} alt="" />
                </button>
                <button
                  type="button"
                  className="hero-social-button"
                  aria-label="GitHub лаунчера"
                  onClick={() => void launcher.openExternal(config.links.github)}
                >
                  <img className="hero-social-icon" src={githubIcon} alt="" />
                </button>
              </div>

              <button
                type="button"
                className="hero-support-button"
                onClick={() => void launcher.openExternal(config.links.wiki)}
              >
                <img className="hero-support-icon" src={loreBookIcon} alt="" />
                <span>Исследовать мир</span>
              </button>
            </div>
          </div>

          <div className="hero-art">
            <img src={heroScene} alt="" />
          </div>
        </section>

        <NewsPanel content={content} fallbackUrl={config.links.site ?? config.links.wiki} />
      </div>

      <TimelineRail content={content} fallbackUrl={config.links.wiki} />

      {selectedView === 'settings' ? (
        <SettingsDrawer
          config={config}
          settings={settings}
          onRamChange={(value) => void saveSettingsPatch({ allocatedRamMb: value })}
          onToggleHideLauncher={(value) => void saveSettingsPatch({ hideLauncherOnGameStart: value })}
          onToggleCloseLauncher={(value) => void saveSettingsPatch({ closeLauncherWhenGameCloses: value })}
          onClose={() => setSelectedView('home')}
        />
      ) : null}

      {isAuthDialogOpen ? (
        <AuthDialog
          mode={selectedView}
          settings={settings}
          authStatus={authStatus}
          accountProfile={accountProfile}
          onLogin={loginAccount}
          onRegister={registerAccount}
          onLogout={logoutAccount}
          onRefreshProfile={refreshAccountProfile}
          onUpdateEmail={updateAccountEmail}
          onChangePassword={changeAccountPassword}
          onRecoverPassword={recoverPassword}
          onClose={() => setSelectedView('home')}
        />
      ) : null}

      {isPlayersPopupOpen ? (
        <div className="players-popup-layer" role="presentation" onClick={() => setIsPlayersPopupOpen(false)}>
          <section className="players-popup" role="dialog" aria-modal="true">
            <p className="sidebar-caption">ИГРОКИ ОНЛАЙН</p>
            {serverStatus?.players?.length ? (
              <ul>
                {serverStatus.players.map((playerName) => (
                  <li key={playerName}>{playerName}</li>
                ))}
              </ul>
            ) : (
              <p>Список игроков сейчас недоступен.</p>
            )}
          </section>
        </div>
      ) : null}

      {isBusy ? (
        <div className="saving-indicator">Сохраняем настройки...</div>
      ) : null}
    </main>
  );
}
