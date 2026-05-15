import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LauncherContent, LauncherTimelineItem } from '../shared/contracts';
import { useDragScroll } from '../hooks/useDragScroll';
import { GlyphIcon, type IconName } from './icons';

interface TimelineRailProps {
  content: LauncherContent;
  fallbackUrl?: string;
}

interface ActiveTimelinePopover {
  item: LauncherTimelineItem;
  x: number;
  y: number;
}

export function TimelineRail({ content, fallbackUrl }: TimelineRailProps) {
  const railRef = useDragScroll<HTMLDivElement>();
  const [activePopover, setActivePopover] = useState<ActiveTimelinePopover | null>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest('.timeline-trigger') || target?.closest('.timeline-floating-popover')) {
        return;
      }

      setActivePopover(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePopover(null);
      }
    };

    const closeOnResize = () => {
      setActivePopover(null);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnResize);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnResize);
    };
  }, []);

  const openPopover = (item: LauncherTimelineItem, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    const viewportPadding = 24;
    const preferredX = rect.left + rect.width / 2;
    const minX = viewportPadding + 130;
    const maxX = window.innerWidth - viewportPadding - 130;

    setActivePopover((current) => current?.item.id === item.id
      ? null
      : {
        item,
        x: Math.min(Math.max(preferredX, minX), maxX),
        y: rect.top - 10,
      });
  };

  return (
    <section className="timeline-section">
      <div className="timeline-caption">История мира</div>

      <div className="timeline-track" ref={railRef}>
        {content.timeline.map((item) => {
          const isActive = activePopover?.item.id === item.id;

          return (
            <article
              className={`timeline-card ${isActive ? 'is-active' : ''}`}
              key={item.id}
            >
              <div className="timeline-marker" />

              <button
                type="button"
                className={`timeline-trigger ${isActive ? 'is-active' : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => openPopover(item, event.currentTarget)}
                aria-expanded={isActive}
              >
                <div className="timeline-emblem">
                  <GlyphIcon name={item.icon as IconName} />
                </div>

                <div className="timeline-copy">
                  <span className="timeline-year">{item.year}</span>
                  <h3>{item.title}</h3>
                </div>
              </button>
            </article>
          );
        })}
      </div>

      {activePopover ? createPortal(
        <div
          className="timeline-floating-popover"
          style={{
            left: `${activePopover.x}px`,
            top: `${activePopover.y}px`,
          }}
        >
          <strong>{activePopover.item.title}</strong>
          <p>{activePopover.item.text}</p>
          <button
            type="button"
            className="timeline-more-button"
            onClick={() => void window.launcher.openExternal(activePopover.item.url?.trim() || fallbackUrl || '')}
          >
            подробнее...
          </button>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
