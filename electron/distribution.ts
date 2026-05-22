import path from 'node:path';
import {
  copy,
  ensureDir,
  move,
  pathExists,
  readJson,
} from 'fs-extra';
import type {
  DistributionManifest,
  LauncherStaticConfig,
} from '../src/shared/contracts';
import { DISTRIBUTION_MANIFEST_FILE } from '../src/shared/constants';
import {
  getBackupsRoot,
  getBundledDistributionDirectory,
  getGameRoot,
} from './paths';

export async function readDistributionManifestFrom(directory: string) {
  const manifestPath = path.join(directory, DISTRIBUTION_MANIFEST_FILE);
  if (!await pathExists(manifestPath)) {
    return null;
  }

  return readJson(manifestPath) as Promise<DistributionManifest>;
}

async function restorePreservedFiles(
  backupDirectory: string,
  targetDirectory: string,
  preservedRelativePaths: string[],
) {
  for (const relativePath of preservedRelativePaths) {
    const from = path.join(backupDirectory, relativePath);
    if (await pathExists(from)) {
      const to = path.join(targetDirectory, relativePath);
      await ensureDir(path.dirname(to));
      await copy(from, to, { overwrite: true });
    }
  }
}

async function copyBundledServerList(
  bundledDirectory: string,
  targetDirectory: string,
) {
  const source = path.join(bundledDirectory, 'servers.dat');
  if (!await pathExists(source) || !await pathExists(targetDirectory)) {
    return;
  }

  await copy(source, path.join(targetDirectory, 'servers.dat'), { overwrite: true });
}

export async function syncBundledDistribution(config: LauncherStaticConfig) {
  const bundledDirectory = getBundledDistributionDirectory();
  const gameRoot = getGameRoot(config);

  if (!await pathExists(bundledDirectory)) {
    return {
      ready: false,
      manifest: null,
      gameRoot,
    };
  }

  const bundledManifest = await readDistributionManifestFrom(bundledDirectory);
  if (!bundledManifest) {
    return {
      ready: false,
      manifest: null,
      gameRoot,
    };
  }

  const currentManifest = await readDistributionManifestFrom(gameRoot);
  const needsRefresh = !currentManifest
    || currentManifest.distributionVersion !== bundledManifest.distributionVersion
    || currentManifest.launcherVersion !== bundledManifest.launcherVersion
    || currentManifest.versionId !== bundledManifest.versionId
    || currentManifest.builtAt !== bundledManifest.builtAt;

  if (needsRefresh) {
    if (await pathExists(gameRoot)) {
      const backupRoot = getBackupsRoot();
      await ensureDir(backupRoot);
      const backupDirectory = path.join(
        backupRoot,
        `${currentManifest?.distributionVersion ?? 'unknown'}-${Date.now()}`,
      );
      await move(gameRoot, backupDirectory, { overwrite: true });
      await copy(bundledDirectory, gameRoot, { overwrite: true });
      await restorePreservedFiles(
        backupDirectory,
        gameRoot,
        config.preserveOnUpdate,
      );
    } else {
      await ensureDir(path.dirname(gameRoot));
      await copy(bundledDirectory, gameRoot, { overwrite: true });
    }
  }

  await copyBundledServerList(bundledDirectory, gameRoot);

  return {
    ready: true,
    manifest: bundledManifest,
    gameRoot,
  };
}
