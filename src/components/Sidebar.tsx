import logoMark from '../assets/logo-mark.png';
import profileIcon from '../assets/Profile.png';
import registrationIcon from '../assets/Registration.png';
import settingsIcon from '../assets/Settings.png';
import type {
  LauncherSettings,
  LauncherStaticConfig,
  ServerStatusPayload,
  SidebarView,
} from '../shared/contracts';

interface SidebarProps {
  config: LauncherStaticConfig;
  settings: LauncherSettings;
  serverStatus: ServerStatusPayload | null;
  selectedView: SidebarView;
  onSelectView: (view: SidebarView) => void;
  onOpenPlayers: () => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    config,
    settings,
    serverStatus,
    selectedView,
    onSelectView,
    onOpenPlayers,
  } = props;
  const isLoggedIn = Boolean(settings.username.trim() && settings.authToken);
  const statusHeadline = serverStatus?.displayText ?? '...';
  const hasPlayerCounts = typeof serverStatus?.playersOnline === 'number'
    && typeof serverStatus.maxPlayers === 'number';
  const statusDetail = serverStatus?.online
    ? hasPlayerCounts
      ? `Игроков в сети: ${serverStatus.playersOnline}/${serverStatus.maxPlayers}`
      : serverStatus.error ?? 'Сервер отвечает, онлайн уточняется...'
    : serverStatus?.error ?? 'Нет данных о состоянии сервера';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <button
          type="button"
          className="sidebar-logo-button"
          aria-label="Открыть сайт проекта"
          onClick={() => void window.launcher.openExternal(config.links.site ?? config.links.wiki)}
        >
          <img
            className="sidebar-logo"
            src={logoMark}
            alt="Forge World"
          />
        </button>
        <span className="sidebar-version">v.{config.launcherVersion}</span>
      </div>

      <nav className="sidebar-nav">
        {isLoggedIn ? (
          <button
            type="button"
            className={`nav-button ${selectedView === 'profile' ? 'is-active' : ''}`}
            onClick={() => onSelectView('profile')}
          >
            <img className="nav-button-icon" src={profileIcon} alt="" />
            <span>{settings.username}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`nav-button ${selectedView === 'login' ? 'is-active' : ''}`}
              onClick={() => onSelectView('login')}
            >
              <img className="nav-button-icon" src={profileIcon} alt="" />
              <span>ВХОД</span>
            </button>
            <button
              type="button"
              className={`nav-button ${selectedView === 'register' ? 'is-active' : ''}`}
              onClick={() => onSelectView('register')}
            >
              <img className="nav-button-icon" src={registrationIcon} alt="" />
              <span>РЕГИСТРАЦИЯ</span>
            </button>
          </>
        )}

        <button
          type="button"
          className={`nav-button ${selectedView === 'settings' ? 'is-active' : ''}`}
          onClick={() => onSelectView('settings')}
        >
          <img className="nav-button-icon" src={settingsIcon} alt="" />
          <span>НАСТРОИКИ</span>
        </button>
      </nav>

      <div className="sidebar-main">
        <section className="sidebar-status">
          <p className="sidebar-caption">ТЕКУЩИЙ ОНЛАЙН</p>
          <strong className={`online-value ${serverStatus?.online ? 'is-online' : 'is-muted'}`}>
            {statusHeadline}
          </strong>
          <div className="status-row">
            <span>{statusDetail}</span>
          </div>
          <button
            type="button"
            className="players-list-button"
            onClick={onOpenPlayers}
            disabled={!serverStatus?.online}
          >
            Игроки
          </button>
        </section>
      </div>
    </aside>
  );
}
