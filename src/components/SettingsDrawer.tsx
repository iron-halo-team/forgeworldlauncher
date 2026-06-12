import type {
  LauncherSettings,
  LauncherStaticConfig,
} from '../shared/contracts';
import { GlyphIcon } from './icons';

interface SettingsDrawerProps {
  config: LauncherStaticConfig;
  settings: LauncherSettings;
  onRamChange: (value: number) => void;
  onRamReset: () => void;
  onToggleHideLauncher: (value: boolean) => void;
  onToggleCloseLauncher: (value: boolean) => void;
  onToggleLaunchAtStartup: (value: boolean) => void;
  onToggleMinimizeToTray: (value: boolean) => void;
  onClose: () => void;
}

function formatRamLabel(value: number) {
  return `${(value / 1024).toFixed(1).replace('.0', '')} ГБ`;
}

function getRamWarning(value: number, config: LauncherStaticConfig) {
  if (value < config.minecraft.recommendedRamMb) {
    return 'Выбрано меньше рекомендованного значения. Игра может запускаться нестабильно или вылетать при загрузке модов.';
  }

  if (value > config.minecraft.safeMaximumRamMb) {
    return 'Выбрано слишком много памяти для этого устройства. Windows и фоновые процессы могут начать мешать игре.';
  }

  if (value > config.minecraft.recommendedRamMb) {
    return 'Значение выше рекомендованного. Это можно оставить, если сборке действительно не хватает памяти.';
  }

  return '';
}

export function SettingsDrawer(props: SettingsDrawerProps) {
  const {
    config,
    settings,
    onRamChange,
    onRamReset,
    onToggleHideLauncher,
    onToggleCloseLauncher,
    onToggleLaunchAtStartup,
    onToggleMinimizeToTray,
    onClose,
  } = props;
  const ramWarning = getRamWarning(settings.allocatedRamMb, config);

  return (
    <div className="settings-overlay" role="presentation" onClick={onClose}>
      <aside className="settings-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="settings-heading">
          <div>
            <p className="eyebrow">НАСТРОЙКИ ЛАУНЧЕРА</p>
            <h2>Управление сборкой</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть настройки">
            <GlyphIcon name="close" />
          </button>
        </div>

        <section className="settings-section">
          <div className="settings-row">
            <div>
              <h3>Выделение памяти</h3>
              <p>Сколько оперативной памяти отдавать Minecraft при запуске.</p>
              <p className="settings-memory-summary">
                Рекомендовано: {formatRamLabel(config.minecraft.recommendedRamMb)}. Память устройства: {formatRamLabel(config.minecraft.deviceTotalRamMb)}.
              </p>
              {ramWarning ? (
                <p className="settings-warning is-alert">{ramWarning}</p>
              ) : null}
            </div>
            <strong>{formatRamLabel(settings.allocatedRamMb)}</strong>
          </div>
          <input
            className="range-input"
            type="range"
            min={config.minecraft.minimumRamMb}
            max={config.minecraft.maximumRamMb}
            step={512}
            value={settings.allocatedRamMb}
            onChange={(event) => onRamChange(Number(event.target.value))}
          />
          <div className="range-labels">
            <span>{formatRamLabel(config.minecraft.minimumRamMb)}</span>
            <span>{formatRamLabel(config.minecraft.maximumRamMb)}</span>
          </div>
          <button type="button" className="settings-default-button" onClick={onRamReset}>
            По умолчанию
          </button>
        </section>

        <section className="settings-section">
          <label className="toggle-row">
            <div>
              <h3>Скрывать лаунчер при запуске</h3>
              <p>После старта игры окно лаунчера будет уходить в фон.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.hideLauncherOnGameStart}
              onChange={(event) => onToggleHideLauncher(event.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <h3>Закрывать лаунчер после выхода</h3>
              <p>Удобно, если не хотите оставлять окно лаунчера открытым после игры.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.closeLauncherWhenGameCloses}
              onChange={(event) => onToggleCloseLauncher(event.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <h3>Запускать на старте системы</h3>
              <p>Лаунчер будет открываться автоматически после входа в Windows.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.launchAtSystemStartup}
              onChange={(event) => onToggleLaunchAtStartup(event.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <h3>Скрывать вместо закрытия</h3>
              <p>Кнопка закрытия будет прятать лаунчер в трей, а не завершать его.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.minimizeToTrayOnClose}
              onChange={(event) => onToggleMinimizeToTray(event.target.checked)}
            />
          </label>
        </section>

        <section className="settings-section">
          <h3>Файлы и конфиги</h3>
          <div className="settings-actions">
            <button type="button" className="ghost-button" onClick={() => void window.launcher.openGameFolder()}>
              <GlyphIcon name="folder" />
              <span>Открыть корень игры</span>
            </button>
            <button type="button" className="ghost-button" onClick={() => void window.launcher.openLauncherDataFolder()}>
              <GlyphIcon name="folder" />
              <span>Открыть папку лаунчера</span>
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
