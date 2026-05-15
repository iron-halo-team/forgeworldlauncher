import { useEffect, useState, useTransition } from 'react';
import discordIcon from './assets/discord.png';
import githubIcon from './assets/github.png';
import heroScene from './assets/hero-scene.png';
import wikiIcon from './assets/wiki.png';
import { NewsPanel } from './components/NewsPanel';
import { Sidebar } from './components/Sidebar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TimelineRail } from './components/TimelineRail';
import { WindowControls } from './components/WindowControls';
import { getLauncherApi } from './lib/mock-launcher';
import type {
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
  const [selectedView, setSelectedView] = useState<SidebarView>('home');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [isBusy, startTransition] = useTransition();
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void launcher.getBootstrap().then((data) => {
      if (!isMounted) {
        return;
      }

      setBootstrap(data);
      setUsernameDraft(data.settings.username);
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

    return () => {
      isMounted = false;
      unsubscribeLaunch();
      unsubscribeServer();
      unsubscribeUpdate();
    };
  }, [launcher]);

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

  const saveSettingsPatch = (patch: Partial<LauncherSettings>) => {
    return launcher.saveSettings(patch).then((nextSettings) => {
      startTransition(() => {
        setBootstrap((current) => current ? {
          ...current,
          settings: nextSettings,
        } : current);
      });

      return nextSettings;
    });
  };

  const saveUsername = async () => {
    const normalized = usernameDraft.trim();
    if (!normalized) {
      return;
    }

    await saveSettingsPatch({ username: normalized });
    setSelectedView('home');
  };

  const launchGame = async () => {
    setIsLaunching(true);

    try {
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

  return (
    <main className="launcher-shell">
      <div className="window-frame" />

      <header className="window-header">
        <div className="window-drag-region" />
        <WindowControls />
      </header>

      <div className="launcher-grid">
        <Sidebar
          config={config}
          settings={settings}
          serverStatus={serverStatus}
          selectedView={selectedView}
          usernameDraft={usernameDraft}
          onUsernameDraftChange={setUsernameDraft}
          onSaveUsername={() => void saveUsername()}
          onCloseLogin={() => setSelectedView('home')}
          onSelectView={setSelectedView}
        />

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">OFFLINE NEOFORGE 1.21.1</span>
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

            <button
              type="button"
              className="play-button"
              disabled={playDisabled}
              onClick={() => void launchGame()}
            >
              <span>{getPlayLabel(launchState)}</span>
            </button>

            <div className={`launch-status ${launchState.phase}`}>
              {launchState.message}
            </div>

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

      {isBusy ? (
        <div className="saving-indicator">Сохраняем настройки...</div>
      ) : null}
    </main>
  );
}
