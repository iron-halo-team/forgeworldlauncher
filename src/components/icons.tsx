import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'settings'
  | 'user'
  | 'discord'
  | 'wiki'
  | 'github'
  | 'pickaxe'
  | 'helm'
  | 'tower'
  | 'crown'
  | 'banner'
  | 'crossed-blades'
  | 'cathedral'
  | 'heart'
  | 'folder'
  | 'file'
  | 'refresh'
  | 'sword'
  | 'minimize'
  | 'maximize'
  | 'close';

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function GlyphIcon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  switch (name) {
    case 'home':
      return (
        <IconBase {...props}>
          <path d="M4 11.5 12 5l8 6.5" />
          <path d="M6.5 10.5V19h11V10.5" />
          <path d="M10 19v-5h4v5" />
        </IconBase>
      );
    case 'settings':
      return (
        <IconBase {...props}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18.3 5.7l-1.6 1.6M7.3 16.7l-1.6 1.6M18.3 18.3l-1.6-1.6M7.3 7.3 5.7 5.7" />
        </IconBase>
      );
    case 'user':
      return (
        <IconBase {...props}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c1.8-3 4.2-4.5 7-4.5S17.2 16 19 19" />
        </IconBase>
      );
    case 'discord':
      return (
        <IconBase {...props}>
          <path d="M8.2 8.6c2.4-1.2 5.2-1.2 7.6 0" />
          <path d="M7 16.4c-1.2-2-1.9-4.2-2.1-6.6l2.3-1.1.9 1.6" />
          <path d="M17 16.4c1.2-2 1.9-4.2 2.1-6.6l-2.3-1.1-.9 1.6" />
          <path d="M8.8 17.8c2.2.6 4.2.6 6.4 0" />
          <circle cx="9.4" cy="12.2" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.6" cy="12.2" r="1" fill="currentColor" stroke="none" />
        </IconBase>
      );
    case 'wiki':
      return (
        <IconBase {...props}>
          <path d="M5.5 6h13v12h-13z" />
          <path d="M8 9h8M8 12h5M8 15h7" />
        </IconBase>
      );
    case 'github':
      return (
        <IconBase {...props}>
          <path d="M9 19c-4 1.2-4-2-5.7-2.5" />
          <path d="M15 20v-3.2c0-1 .1-1.6-.4-2.1 2.8-.3 5.7-1.4 5.7-6.1a4.8 4.8 0 0 0-1.3-3.4 4.4 4.4 0 0 0-.1-3.3S17.8 1.5 15 3.4a11 11 0 0 0-6 0C6.2 1.5 5.1 1.9 5.1 1.9A4.4 4.4 0 0 0 5 5.2a4.8 4.8 0 0 0-1.3 3.4c0 4.7 2.9 5.8 5.7 6.1-.5.5-.5 1.3-.5 2.1V20" />
        </IconBase>
      );
    case 'pickaxe':
      return (
        <IconBase {...props}>
          <path d="m6 4 6 3 6-1" />
          <path d="m12 7-3 3 6 6" />
          <path d="m9 10-2 7" />
        </IconBase>
      );
    case 'helm':
      return (
        <IconBase {...props}>
          <path d="M6 16c0-6 2.5-9 6-9s6 3 6 9" />
          <path d="M7 16h10l-1.2 3H8.2L7 16Z" />
          <path d="M9.2 11h1.6M13.2 11h1.6" />
        </IconBase>
      );
    case 'tower':
      return (
        <IconBase {...props}>
          <path d="M7 19h10l-1-8H8l-1 8Z" />
          <path d="M9 11V6h6v5" />
          <path d="M8 6h8l-1-2h-6L8 6Z" />
          <path d="M11 19v-4h2v4" />
        </IconBase>
      );
    case 'crown':
      return (
        <IconBase {...props}>
          <path d="M4 17h16l-1 3H5l-1-3Z" />
          <path d="m5 17 2-8 5 4 5-7 2 11" />
        </IconBase>
      );
    case 'banner':
      return (
        <IconBase {...props}>
          <path d="M8 20V4" />
          <path d="M9 4h8l-2.5 3 2.5 3H9l1.8-3L9 4Z" />
          <path d="M8 20h8" />
        </IconBase>
      );
    case 'crossed-blades':
      return (
        <IconBase {...props}>
          <path d="m6 5 12 12" />
          <path d="m18 5-12 12" />
          <path d="m8 7-2-2M18 17l-2-2M16 7l2-2M6 17l2-2" />
        </IconBase>
      );
    case 'cathedral':
      return (
        <IconBase {...props}>
          <path d="M8 19V11l4-4 4 4v8" />
          <path d="M10 19v-4h4v4" />
          <path d="M7 11H5l2-3M17 11h2l-2-3" />
          <path d="M12 7V4" />
        </IconBase>
      );
    case 'heart':
      return (
        <IconBase {...props}>
          <path d="M12 20 4.5 12.7A4.8 4.8 0 0 1 11.2 6l.8.8.8-.8a4.8 4.8 0 0 1 6.7 6.7L12 20Z" />
        </IconBase>
      );
    case 'folder':
      return (
        <IconBase {...props}>
          <path d="M3.5 8.5h6l1.7 2h9.3v8H3.5z" />
          <path d="M3.5 10.5v-4h5l1.7 2" />
        </IconBase>
      );
    case 'file':
      return (
        <IconBase {...props}>
          <path d="M7 3.5h7l3 3V20H7z" />
          <path d="M14 3.5v3h3" />
          <path d="M9.5 11h5M9.5 14h5" />
        </IconBase>
      );
    case 'refresh':
      return (
        <IconBase {...props}>
          <path d="M20 8v5h-5" />
          <path d="M4 16v-5h5" />
          <path d="M18.4 13A7 7 0 0 1 6.3 17" />
          <path d="M5.6 11A7 7 0 0 1 17.7 7" />
        </IconBase>
      );
    case 'sword':
      return (
        <IconBase {...props}>
          <path d="M12 3v8" />
          <path d="m12 11-2.8 2.8 1.8 1.8L12 14.6l1 1 1.8-1.8L12 11Z" />
          <path d="M12 15.5V21" />
        </IconBase>
      );
    case 'minimize':
      return (
        <IconBase {...props}>
          <path d="M5 12h14" />
        </IconBase>
      );
    case 'maximize':
      return (
        <IconBase {...props}>
          <path d="M6 6h12v12H6z" />
        </IconBase>
      );
    case 'close':
      return (
        <IconBase {...props}>
          <path d="M6 6 18 18M18 6 6 18" />
        </IconBase>
      );
    default:
      return <IconBase {...props} />;
  }
}
