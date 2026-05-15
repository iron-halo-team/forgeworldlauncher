import type { LauncherContent } from '../shared/contracts';

interface NewsPanelProps {
  content: LauncherContent;
  fallbackUrl?: string;
}

export function NewsPanel({ content, fallbackUrl }: NewsPanelProps) {
  return (
    <aside className="news-panel">
      <div className="news-header">
        <h2>{content.newsTitle}</h2>
      </div>

      <div className="news-list">
        {content.news.map((item) => {
          const targetUrl = item.url?.trim() || fallbackUrl;
          const body = (
            <>
              <div className="news-item-accent" />

              <div className="news-copy">
                <div className="news-item-heading">
                  <h3>{item.title}</h3>
                  <span>{item.date}</span>
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
                onClick={() => void window.launcher.openExternal(targetUrl)}
              >
                {body}
              </button>
            );
          }

          return (
            <article className="news-item" key={item.id}>
              {body}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
