import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const preparedDistribution = path.join(root, 'build', 'offline-distribution');
const packagedDistribution = path.join(root, 'pack', 'offline-distribution');
const distributionMarker = '.forge-world-distribution.json';

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function getDistributionVersion(distributionPath: string) {
  const manifest = await readJsonFile<{ distributionVersion?: string }>(
    path.join(distributionPath, distributionMarker),
  );

  return manifest?.distributionVersion ?? null;
}

async function getNewestMtimeMs(targetPath: string): Promise<number> {
  try {
    const info = await stat(targetPath);
    if (!info.isDirectory()) {
      return info.mtimeMs;
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    let newest = info.mtimeMs;
    for (const entry of entries) {
      newest = Math.max(
        newest,
        await getNewestMtimeMs(path.join(targetPath, entry.name)),
      );
    }

    return newest;
  } catch {
    return 0;
  }
}

async function isNewerThan(sourcePath: string, targetPath: string) {
  const [sourceMtime, targetMtime] = await Promise.all([
    getNewestMtimeMs(sourcePath),
    getNewestMtimeMs(targetPath),
  ]);

  return sourceMtime > 0 && (targetMtime === 0 || sourceMtime > targetMtime + 1000);
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
      }
    });
  });
}

async function main() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const electronBuilderCommand = process.platform === 'win32'
    ? '.\\node_modules\\.bin\\electron-builder.cmd'
    : './node_modules/.bin/electron-builder';
  const isDirBuild = process.argv.includes('--dir');
  const config = await readJsonFile<{ distributionVersion?: string }>(
    path.join(root, 'launcher.config.json'),
  );
  const expectedDistributionVersion = config?.distributionVersion ?? null;
  const preparedDistributionVersion = await getDistributionVersion(preparedDistribution);
  const packagedDistributionVersion = await getDistributionVersion(packagedDistribution);
  const sourceDistribution = path.join(root, 'distribution-source');
  const clientDistribution = path.join(root, 'client');
  const sourceDistributionChanged = await isNewerThan(
    sourceDistribution,
    preparedDistribution,
  );
  const clientDistributionChanged = await isNewerThan(
    clientDistribution,
    preparedDistribution,
  );
  const preparedDistributionChanged = await isNewerThan(
    preparedDistribution,
    packagedDistribution,
  );
  const shouldPrepareDistribution = process.argv.includes('--prepare')
    || process.env.FORGE_WORLD_REFRESH_DISTRIBUTION === '1'
    || !preparedDistributionVersion
    || sourceDistributionChanged
    || clientDistributionChanged
    || Boolean(
      expectedDistributionVersion
      && preparedDistributionVersion !== expectedDistributionVersion,
    );
  const shouldCopyPreparedDistribution = shouldPrepareDistribution
    || !packagedDistributionVersion
    || preparedDistributionChanged
    || Boolean(
      expectedDistributionVersion
      && packagedDistributionVersion !== expectedDistributionVersion,
    )
    || Boolean(
      preparedDistributionVersion
      && packagedDistributionVersion !== preparedDistributionVersion,
    );

  await run(npmCommand, ['run', 'patch:deps']);
  if (shouldPrepareDistribution) {
    await run(npmCommand, ['run', 'prepare:distribution']);
  }
  if (shouldCopyPreparedDistribution) {
    await rm(packagedDistribution, { recursive: true, force: true });
    await mkdir(path.dirname(packagedDistribution), { recursive: true });
    await cp(preparedDistribution, packagedDistribution, { recursive: true });
  }
  if (!existsSync(path.join(packagedDistribution, distributionMarker))) {
    throw new Error(
      `Missing packaged offline distribution: ${path.join(packagedDistribution, distributionMarker)}`,
    );
  }
  await run(npmCommand, ['run', 'build']);
  await run(electronBuilderCommand, isDirBuild ? ['--dir'] : []);
  if (!isDirBuild && process.platform === 'win32') {
    await run(process.execPath, ['scripts/patch-windows-metadata.cjs', '--release']);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
