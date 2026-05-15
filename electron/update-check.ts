import semver from 'semver';
import type {
  LauncherStaticConfig,
  LauncherUpdateInfo,
} from '../src/shared/contracts';
import { parseUpdateInfo } from './static-data';

function isNewerVersion(latestVersion: string, currentVersion: string) {
  const latest = semver.coerce(latestVersion);
  const current = semver.coerce(currentVersion);

  if (!latest || !current) {
    return latestVersion !== currentVersion;
  }

  return semver.gt(latest, current);
}

export async function fetchAvailableUpdate(
  config: LauncherStaticConfig,
): Promise<LauncherUpdateInfo | null> {
  if (!config.update.metadataUrl || config.update.metadataUrl.includes('example.com')) {
    return null;
  }

  try {
    const response = await fetch(config.update.metadataUrl, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const parsed = parseUpdateInfo(await response.json());
    if (!isNewerVersion(parsed.latestVersion, config.launcherVersion)) {
      return null;
    }

    return {
      ...parsed,
      downloadUrl: parsed.downloadUrl ?? config.update.downloadPage,
    };
  } catch {
    return null;
  }
}
