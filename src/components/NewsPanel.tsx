import {
  useEffect,
  useState,
} from 'react';
import type { LauncherContent } from '../shared/contracts';

interface NewsPanelProps {
  content: LauncherContent;
  fallbackUrl?: string;
}

const KNOWN_NEWS_KEY = 'forge-world-known-news-v2';
const NEW_NEWS_KEY = 'forge-world-new-news-v2';
const DISMISSED_NEWS_KEY = 'forge-world-dismissed-news-v2';
const NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000;

function readStringList(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function readTimestampMap(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
    );
  } catch {
    return {};
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked localStorage should not break launcher content rendering.
  }
}

function parseNewsDate(date: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function NewsPanel({ content, fallbackUrl }: NewsPanelProps) {
  const [dismissedNewsIds, setDismissedNewsIds] = useState<Set<string>>(
    () => new Set(readStringList(DISMISSED_NEWS_KEY)),
  );
  const [newNewsSince, setNewNewsSince] = useState<Record<string, number>>(
    () => readTimestampMap(NEW_NEWS_KEY),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const currentIds = content.news.map((item) => item.id);
    const currentIdSet = new Set(currentIds);
    const knownIds = readStringList(KNOWN_NEWS_KEY);
    const knownIdSet = new Set(knownIds);
    const nextNewNewsSince = readTimestampMap(NEW_NEWS_KEY);
    const timestamp = Date.now();

    for (const item of content.news) {
      const publishedAt = parseNewsDate(item.date);
      const isFreshByDate = publishedAt !== null && timestamp - publishedAt <= NEW_BADGE_TTL_MS;

      if (knownIds.length === 0) {
        if (isFreshByDate && !nextNewNewsSince[item.id]) {
          nextNewNewsSince[item.id] = publishedAt;
        }
      } else if (!knownIdSet.has(item.id)) {
        nextNewNewsSince[item.id] = timestamp;
      }
    }

    for (const id of Object.keys(nextNewNewsSince)) {
      if (!currentIdSet.has(id) || timestamp - nextNewNewsSince[id] > NEW_BADGE_TTL_MS) {
        delete nextNewNewsSince[id];
      }
    }

    writeJson(KNOWN_NEWS_KEY, currentIds);
    writeJson(NEW_NEWS_KEY, nextNewNewsSince);
    setNewNewsSince(nextNewNewsSince);
  }, [content.news]);

  const dismissNewsBadge = (id: string) => {
    setDismissedNewsIds((current) => {
      if (current.has(id)) {
        return current;
      }

      const next = new Set(current);
      next.add(id);
      writeJson(DISMISSED_NEWS_KEY, Array.from(next));
      return next;
    });
  };

  return (
    <aside className="news-panel">
      <div className="news-header">
        <h2>{content.newsTitle}</h2>
      </div>

      <div className="news-list">
        {content.news.map((item) => {
          const targetUrl = item.url?.trim() || fallbackUrl;
          const isNew = Boolean(newNewsSince[item.id])
            && now - newNewsSince[item.id] <= NEW_BADGE_TTL_MS
            && !dismissedNewsIds.has(item.id);
          const body = (
            <>
              <div className="news-item-accent" />

              <div className="news-copy">
                <div className="news-item-heading">
                  <h3>{item.title}</h3>
                  <div className="news-meta">
                    <span className="news-date">{item.date}</span>
                    {isNew ? (
                      <span className="news-new-badge">новое</span>
                    ) : null}
                  </div>
                </div>
                <p>{item.text}</p>
              </div>
            </>
          );

          if (targetUrl) {
            return (
              <button
                type="button"
                className="news-item news-item-button"
                key={item.id}
                onClick={() => {
                  dismissNewsBadge(item.id);
                  void window.launcher.openExternal(targetUrl);
                }}
              >
                {body}
              </button>
            );
          }

          return (
            <article
              className="news-item"
              key={item.id}
            >
              {body}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
