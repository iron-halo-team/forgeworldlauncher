import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import haimeitIcon from '../assets/history/book_06d.png';
import coalitionWarIcon from '../assets/history/icon26.png';
import empireFallIcon from '../assets/history/icon28.png';
import empireIcon from '../assets/history/icon36.png';
import greatWarIcon from '../assets/history/sword_02b.png';
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

interface TimelineScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const timelineIconById: Record<string, string> = {
  empire: empireIcon,
  'empire-fall': empireFallIcon,
  liork: coalitionWarIcon,
  haimeit: haimeitIcon,
  'shadow-event': greatWarIcon,
};

export function TimelineRail({ content, fallbackUrl }: TimelineRailProps) {
  const railRef = useDragScroll<HTMLDivElement>();
  const [activePopover, setActivePopover] = useState<ActiveTimelinePopover | null>(null);
  const [scrollState, setScrollState] = useState<TimelineScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
  });

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

  useEffect(() => {
    const node = railRef.current;

    if (!node) {
      return;
    }

    let frameId = 0;

    const updateScrollState = () => {
      const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
      const nextState = {
        canScrollLeft: node.scrollLeft > 2,
        canScrollRight: node.scrollLeft < maxScroll - 2,
      };

      setScrollState((current) => (
        current.canScrollLeft === nextState.canScrollLeft
          && current.canScrollRight === nextState.canScrollRight
          ? current
          : nextState
      ));
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateScrollState);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);

    resizeObserver.observe(node);
    node.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      node.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [content.timeline.length, railRef]);

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

  const scrollTimelineToEdge = (direction: 'left' | 'right') => {
    const node = railRef.current;

    if (!node) {
      return;
    }

    setActivePopover(null);
    node.scrollTo({
      left: direction === 'left' ? 0 : node.scrollWidth - node.clientWidth,
      behavior: 'smooth',
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
                  {timelineIconById[item.id] ? (
                    <img
                      className="timeline-emblem-image"
                      src={timelineIconById[item.id]}
                      alt=""
                    />
                  ) : (
                    <GlyphIcon name={item.icon as IconName} />
                  )}
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

      {scrollState.canScrollLeft ? (
        <button
          type="button"
          className="timeline-edge-button timeline-edge-button-left"
          aria-label="Scroll timeline to start"
          onClick={() => scrollTimelineToEdge('left')}
        >
          <GlyphIcon name="chevron-left" />
        </button>
      ) : null}

      {scrollState.canScrollRight ? (
        <button
          type="button"
          className="timeline-edge-button timeline-edge-button-right"
          aria-label="Scroll timeline to end"
          onClick={() => scrollTimelineToEdge('right')}
        >
          <GlyphIcon name="chevron-right" />
        </button>
      ) : null}

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
