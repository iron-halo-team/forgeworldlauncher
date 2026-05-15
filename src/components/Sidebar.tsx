import logoMark from '../assets/logo-mark.png';
import type {
  LauncherSettings,
  LauncherStaticConfig,
  ServerStatusPayload,
  SidebarView,
} from '../shared/contracts';
import { GlyphIcon } from './icons';

interface SidebarProps {
  config: LauncherStaticConfig;
  settings: LauncherSettings;
  serverStatus: ServerStatusPayload | null;
  selectedView: SidebarView;
  usernameDraft: string;
  onUsernameDraftChange: (value: string) => void;
  onSaveUsername: () => void;
  onCloseLogin: () => void;
  onSelectView: (view: SidebarView) => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    config,
    settings,
    serverStatus,
    selectedView,
    usernameDraft,
    onUsernameDraftChange,
    onSaveUsername,
    onCloseLogin,
    onSelectView,
  } = props;

  const loginLabel = settings.username.trim() || 'ВХОД';
  const statusHeadline = serverStatus?.displayText ?? '...';
  const statusDetail = serverStatus?.online
    ? `Игроков в сети: ${serverStatus.playersOnline ?? 0}/${serverStatus.maxPlayers ?? 0}`
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
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`nav-button ${selectedView === 'login' ? 'is-active' : ''}`}
          onClick={() => onSelectView('login')}
        >
          <GlyphIcon name="user" />
          <span>{loginLabel}</span>
        </button>

        <button
          type="button"
          className={`nav-button ${selectedView === 'settings' ? 'is-active' : ''}`}
          onClick={() => onSelectView('settings')}
        >
          <GlyphIcon name="settings" />
          <span>НАСТРОИКИ</span>
        </button>
      </nav>

      <div className="sidebar-main">
        {selectedView === 'login' ? (
          <section className="sidebar-card sidebar-login-card">
            <div className="sidebar-card-head">
              <p className="sidebar-caption">ОФФЛАЙН ВХОД</p>
              <button
                type="button"
                className="sidebar-dismiss-button"
                aria-label="Закрыть вход"
                onClick={onCloseLogin}
              >
                <GlyphIcon name="close" />
              </button>
            </div>
            <label className="field-label" htmlFor="username">
              Имя игрока
            </label>
            <input
              id="username"
              className="text-input"
              maxLength={16}
              value={usernameDraft}
              onChange={(event) => onUsernameDraftChange(event.target.value)}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={onSaveUsername}
            >
              Сохранить
            </button>
            <p className="field-note">Сейчас: {settings.username}</p>
          </section>
        ) : (
          <section className="sidebar-status">
            <p className="sidebar-caption">ТЕКУЩИЙ ОНЛАЙН</p>
            <strong className={`online-value ${serverStatus?.online ? 'is-online' : 'is-muted'}`}>
              {statusHeadline}
            </strong>
            <div className="status-row">
              <span>{statusDetail}</span>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
