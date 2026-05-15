import type {
  LauncherSettings,
  LauncherStaticConfig,
} from '../shared/contracts';
import { GlyphIcon } from './icons';

interface SettingsDrawerProps {
  config: LauncherStaticConfig;
  settings: LauncherSettings;
  onRamChange: (value: number) => void;
  onToggleHideLauncher: (value: boolean) => void;
  onToggleCloseLauncher: (value: boolean) => void;
  onClose: () => void;
}

function formatRamLabel(value: number) {
  return `${(value / 1024).toFixed(1).replace('.0', '')} ГБ`;
}

export function SettingsDrawer(props: SettingsDrawerProps) {
  const {
    config,
    settings,
    onRamChange,
    onToggleHideLauncher,
    onToggleCloseLauncher,
    onClose,
  } = props;

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
              <p className="settings-warning">
                Не меняйте это значение, если не понимаете, что делаете: неверное выделение памяти может ухудшить запуск и стабильность игры.
              </p>
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
        </section>

        <section className="settings-section">
          <h3>Файлы и конфиги</h3>
          <div className="settings-actions">
            <button type="button" className="ghost-button" onClick={() => void window.launcher.openGameFolder()}>
              <GlyphIcon name="folder" />
              <span>Открыть папку сборки</span>
            </button>
            <button type="button" className="ghost-button" onClick={() => void window.launcher.openLauncherDataFolder()}>
              <GlyphIcon name="folder" />
              <span>Открыть папку лаунчера</span>
            </button>
            <button type="button" className="ghost-button" onClick={() => void window.launcher.openSettingsFile()}>
              <GlyphIcon name="file" />
              <span>Открыть settings.json</span>
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
