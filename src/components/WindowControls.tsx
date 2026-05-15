import { GlyphIcon } from './icons';

export function WindowControls() {
  return (
    <div className="window-controls">
      <button
        className="icon-button"
        type="button"
        aria-label="Свернуть"
        onClick={() => void window.launcher.minimizeWindow()}
      >
        <GlyphIcon name="minimize" />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="Развернуть"
        onClick={() => void window.launcher.toggleMaximizeWindow()}
      >
        <GlyphIcon name="maximize" />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="Закрыть"
        onClick={() => void window.launcher.closeWindow()}
      >
        <GlyphIcon name="close" />
      </button>
    </div>
  );
}
