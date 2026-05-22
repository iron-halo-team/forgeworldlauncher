import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile as readBinaryFile } from 'node:fs/promises';
import {
  copy,
  emptyDir,
  ensureDir,
  pathExists,
  readJson,
  readdir,
  remove,
  writeFile,
  writeJson,
} from 'fs-extra';
import { Agent, interceptors, type Dispatcher } from 'undici';
import {
  LibraryInfo,
  MinecraftFolder,
  type ResolvedLibrary,
  Version,
} from '@xmcl/core';
import {
  getVersionList,
  installByProfile,
  installDependencies,
  installVersion,
  isForgeInstallerEntries,
  resolveLibraryDownloadUrls,
  unpackForgeInstaller,
  walkForgeInstallerEntries,
} from '@xmcl/installer';
import { open, readEntry } from '@xmcl/unzip';
import type {
  DistributionManifest,
  LauncherStaticConfig,
} from '../src/shared/contracts';
import { DISTRIBUTION_MANIFEST_FILE } from '../src/shared/constants';

const rootDirectory = process.cwd();
const buildDirectory = path.join(rootDirectory, 'build');
const outputDirectory = path.join(buildDirectory, 'offline-distribution');
const workingDirectory = path.join(buildDirectory, '.distribution-workdir');
const installerCacheDirectory = path.join(buildDirectory, '.installer-cache');
const clientSourceDirectory = path.join(rootDirectory, 'client');
const clientCoreEntries = new Set([
  '.forge-world-distribution.json',
  'assets',
  'crash-reports',
  'launcher_profiles.json',
  'libraries',
  'logs',
  'natives',
  'runtime',
  'versions',
]);

function logStep(message: string) {
  process.stdout.write(`\n[Forge World] ${message}\n`);
}

function createDispatcher(): Dispatcher {
  return new Agent({
    bodyTimeout: 0,
    connectTimeout: 60_000,
    connections: 8,
    headersTimeout: 0,
  }).compose(
    interceptors.retry({ maxRetries: 5 }),
    interceptors.redirect({ maxRedirections: 5 }),
  );
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runCommand(command: string, args: string[], cwd?: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed: ${command} ${args.join(' ')}`));
      }
    });
  });
}

async function downloadFile(url: string, destination: string) {
  await ensureDir(path.dirname(destination));
  await remove(destination).catch(() => undefined);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, data);
}

async function readRemoteSha1(url: string) {
  try {
    const response = await fetch(`${url}.sha1`, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      return undefined;
    }

    const text = (await response.text()).trim();
    const hash = text.split(/\s+/)[0]?.toLowerCase();

    if (!hash || !/^[a-f0-9]{40}$/.test(hash)) {
      return undefined;
    }

    return hash;
  } catch {
    return undefined;
  }
}

async function downloadFileByRanges(
  url: string,
  destination: string,
  expectedSha1?: string,
) {
  await ensureDir(path.dirname(destination));
  await remove(destination).catch(() => undefined);

  const probeResponse = await fetch(url, {
    headers: { Range: 'bytes=0-0' },
    signal: AbortSignal.timeout(60_000),
  });

  if (probeResponse.status !== 206) {
    throw new Error(`Range download is not supported for ${url}: ${probeResponse.status}`);
  }

  const contentRange = probeResponse.headers.get('content-range');
  const totalSizeMatch = contentRange?.match(/\/(\d+)$/);
  if (!totalSizeMatch) {
    throw new Error(`Unable to detect installer size from ${contentRange ?? 'missing content-range header'}`);
  }

  await probeResponse.arrayBuffer();

  const totalSize = Number.parseInt(totalSizeMatch[1], 10);
  const chunkSize = 8 * 1024;
  const chunks: Buffer[] = [];
  const totalChunks = Math.ceil(totalSize / chunkSize);

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(totalSize - 1, start + chunkSize - 1);
    const expectedLength = end - start + 1;

    let chunk: Buffer | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { Range: `bytes=${start}-${end}` },
          signal: AbortSignal.timeout(60_000),
        });

        if (response.status !== 206) {
          throw new Error(`Unexpected HTTP ${response.status} for bytes ${start}-${end}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length !== expectedLength) {
          throw new Error(`Unexpected chunk size ${buffer.length} for bytes ${start}-${end}`);
        }

        chunk = buffer;
        break;
      } catch (error) {
        lastError = error;
        await delay(Math.min(5_000, attempt * 500));
      }
    }

    if (!chunk) {
      throw new AggregateError(
        [lastError],
        `Failed to download bytes ${start}-${end} for ${path.basename(destination)}`,
      );
    }

    chunks.push(chunk);

    if ((index + 1) % 64 === 0 || index === totalChunks - 1) {
      const downloadedSize = Math.min(totalSize, (index + 1) * chunkSize);
      const progress = Math.round((downloadedSize / totalSize) * 100);
      logStep(`Installer download progress: ${progress}%`);
    }
  }

  const data = Buffer.concat(chunks);
  if (data.length !== totalSize) {
    throw new Error(`Unexpected assembled installer size ${data.length}, expected ${totalSize}`);
  }

  if (expectedSha1 && sha1(data) !== expectedSha1) {
    throw new Error(`SHA1 mismatch for ${path.basename(destination)} after range download`);
  }

  await writeFile(destination, data);
}

async function downloadFileWithFallback(url: string, destination: string) {
  const attempts = 3;
  const expectedSha1 = await readRemoteSha1(url);

  if (expectedSha1 && await fileMatchesSha1(destination, expectedSha1)) {
    return;
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await downloadFile(url, destination);

      if (expectedSha1 && !await fileMatchesSha1(destination, expectedSha1)) {
        throw new Error(`SHA1 mismatch for ${path.basename(destination)}`);
      }

      return;
    } catch (error) {
      if (attempt === attempts) {
        break;
      }

      logStep(`Загрузка ${path.basename(destination)}: попытка ${attempt} не удалась, повторяем...`);
    }
  }

  try {
    logStep(`Switching to range download for ${path.basename(destination)}...`);
    await downloadFileByRanges(url, destination, expectedSha1);
    return;
  } catch {
    // Fall through to the Windows-native downloader below.
  }

  if (process.platform === 'win32') {
    logStep('Переходим на системную загрузку PowerShell для NeoForge installer...');
    await runCommand('powershell', [
      '-NoProfile',
      '-Command',
      `$ErrorActionPreference='Stop'; Invoke-WebRequest '${url}' -OutFile '${destination}' -ErrorAction Stop | Out-Null`,
    ], rootDirectory);

    if (expectedSha1 && !await fileMatchesSha1(destination, expectedSha1)) {
      throw new Error(`SHA1 mismatch for ${path.basename(destination)}`);
    }

    return;
  }

  throw new Error(`Failed to download ${url}`);
}

function sha1(buffer: Buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

async function fileMatchesSha1(filePath: string, expectedSha1: string) {
  if (!expectedSha1 || !await pathExists(filePath)) {
    return false;
  }

  const fileBuffer = await readBinaryFile(filePath);
  return sha1(fileBuffer) === expectedSha1;
}

async function downloadBuffer(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function downloadArtifactWithChecksum(
  urls: string[],
  destination: string,
  expectedSha1: string,
) {
  await ensureDir(path.dirname(destination));

  if (await fileMatchesSha1(destination, expectedSha1)) {
    return;
  }

  const errors: unknown[] = [];

  for (const url of urls) {
    try {
      await remove(destination).catch(() => undefined);
      const data = await downloadBuffer(url);

      if (expectedSha1 && sha1(data) !== expectedSha1) {
        throw new Error(`SHA1 mismatch for ${url}`);
      }

      await writeFile(destination, data);
      return;
    } catch (error) {
      errors.push(error);
    }

    if (process.platform !== 'win32') {
      continue;
    }

    try {
      await remove(destination).catch(() => undefined);
      await runCommand('powershell', [
        '-NoProfile',
        '-Command',
        `$ErrorActionPreference='Stop'; Invoke-WebRequest '${url}' -OutFile '${destination}' -ErrorAction Stop | Out-Null`,
      ], rootDirectory);

      if (expectedSha1 && !await fileMatchesSha1(destination, expectedSha1)) {
        throw new Error(`SHA1 mismatch for ${url}`);
      }

      return;
    } catch (error) {
      errors.push(error);
    }
  }

  throw new AggregateError(errors, `Failed to download ${path.basename(destination)}`);
}

function createDownloadOptions() {
  const dispatcher = createDispatcher();

  return {
    assetsDownloadConcurrency: 2,
    dispatcher,
    librariesDownloadConcurrency: 2,
    throwErrorImmediately: false,
  } as const;
}

async function withRetries<T>(label: string, attempts: number, action: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      logStep(`${label}: попытка ${attempt} не удалась, повторяем...`);
    }
  }

  throw lastError;
}

async function prefetchLibraries(
  libraries: ResolvedLibrary[],
  instanceDirectory: string,
  downloadOptions: ReturnType<typeof createDownloadOptions>,
) {
  const minecraftFolder = MinecraftFolder.from(instanceDirectory);
  const uniqueLibraries = new Map<string, ResolvedLibrary>();

  for (const library of libraries) {
    if (!library.download.path) {
      continue;
    }

    uniqueLibraries.set(library.download.path, library);
  }

  for (const library of uniqueLibraries.values()) {
    if (!library.download.path) {
      continue;
    }

    const destination = minecraftFolder.getLibraryByPath(library.download.path);
    const urls = resolveLibraryDownloadUrls(library, {
      ...downloadOptions,
      mavenHost: [
        'https://maven.neoforged.net/releases',
        'https://libraries.minecraft.net',
        'https://repo1.maven.org/maven2',
      ],
    });

    await withRetries(
      `Загрузка ${library.name}`,
      4,
      () => downloadArtifactWithChecksum(
        urls,
        destination,
        library.download.sha1,
      ),
    );
  }
}

async function copyDistributionOverrides(instanceDirectory: string) {
  const sourceDirectory = path.join(rootDirectory, 'distribution-source');
  if (!await pathExists(sourceDirectory)) {
    return;
  }

  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    await copy(
      path.join(sourceDirectory, entry.name),
      path.join(instanceDirectory, entry.name),
      { overwrite: true },
    );
  }
}

async function copyReadyClientOverrides(instanceDirectory: string) {
  if (!await pathExists(clientSourceDirectory)) {
    return;
  }

  const entries = await readdir(clientSourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (clientCoreEntries.has(entry.name)) {
      continue;
    }

    await copy(
      path.join(clientSourceDirectory, entry.name),
      path.join(instanceDirectory, entry.name),
      { overwrite: true },
    );
  }
}

async function copyInstanceOverrides(instanceDirectory: string) {
  await copyDistributionOverrides(instanceDirectory);
}

interface ClientSourceVersion {
  filePath: string;
  versionId: string;
  score: number;
}

async function detectReadyClientVersion(config: LauncherStaticConfig) {
  if (!await pathExists(clientSourceDirectory)) {
    return null;
  }

  const requiredDirectories = [
    'assets',
    'libraries',
    'versions',
  ];

  for (const directoryName of requiredDirectories) {
    if (!await pathExists(path.join(clientSourceDirectory, directoryName))) {
      return null;
    }
  }

  const versionRoot = path.join(clientSourceDirectory, 'versions');
  const versionDirectories = await readdir(versionRoot, { withFileTypes: true });
  const candidates: ClientSourceVersion[] = [];

  for (const directoryEntry of versionDirectories) {
    if (!directoryEntry.isDirectory()) {
      continue;
    }

    const versionDirectory = path.join(versionRoot, directoryEntry.name);
    const files = await readdir(versionDirectory, { withFileTypes: true });

    for (const fileEntry of files) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('.json')) {
        continue;
      }

      try {
        const filePath = path.join(versionDirectory, fileEntry.name);
        const versionJson = await readJson(filePath) as {
          id?: string;
          mainClass?: string;
          inheritsFrom?: string;
          jar?: string;
          type?: string;
        };

        if (!versionJson.id) {
          continue;
        }

        let score = 0;
        const normalizedId = versionJson.id.toLowerCase();
        const normalizedFolderName = directoryEntry.name.toLowerCase();

        if (versionJson.type === 'modified') {
          score += 20;
        }

        if (versionJson.mainClass?.includes('BootstrapLauncher')) {
          score += 30;
        }

        if (normalizedId.includes('neoforge') || normalizedFolderName.includes('neoforge')) {
          score += 30;
        }

        if (normalizedId.includes(config.minecraft.version) || normalizedFolderName.includes(config.minecraft.version)) {
          score += 10;
        }

        if (versionJson.jar === config.minecraft.version || versionJson.inheritsFrom === config.minecraft.version) {
          score += 10;
        }

        candidates.push({
          filePath,
          versionId: versionJson.id,
          score,
        });
      } catch {
        // Ignore malformed candidate and continue scanning.
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0];
}

async function prepareDistributionFromReadyClient(config: LauncherStaticConfig) {
  const detectedVersion = await detectReadyClientVersion(config);
  if (!detectedVersion) {
    return false;
  }

  const instanceDirectory = path.join(workingDirectory, config.minecraft.instanceFolderName);

  logStep(`Обнаружен готовый клиент в папке client. Используем версию ${detectedVersion.versionId} без онлайн-докачки...`);
  await emptyDir(workingDirectory);
  await emptyDir(outputDirectory);
  await ensureDir(instanceDirectory);

  logStep('Копируем готовый клиент в офлайн-дистрибутив...');
  await copy(clientSourceDirectory, instanceDirectory, { overwrite: true });

  logStep('Накладываем поверх дополнительные файлы из distribution-source, если они есть...');
  await copyInstanceOverrides(instanceDirectory);

  const bundledJavaPath = path.join(
    instanceDirectory,
    'runtime',
    'java',
    'bin',
    process.platform === 'win32' ? 'javaw.exe' : 'java',
  );

  if (!await pathExists(bundledJavaPath)) {
    await createBundledRuntime(instanceDirectory);
  }

  const manifest: DistributionManifest = {
    distributionVersion: config.distributionVersion,
    launcherVersion: config.launcherVersion,
    minecraftVersion: config.minecraft.version,
    neoForgeVersion: config.minecraft.neoForgeVersion,
    versionId: detectedVersion.versionId,
    builtAt: new Date().toISOString(),
  };

  await writeJson(
    path.join(instanceDirectory, DISTRIBUTION_MANIFEST_FILE),
    manifest,
    { spaces: 2 },
  );

  logStep('Сохраняем готовую офлайн-сборку из client в build/offline-distribution...');
  await copy(instanceDirectory, outputDirectory, { overwrite: true });
  return true;
}

async function createBundledRuntime(instanceDirectory: string) {
  const runtimeDirectory = path.join(instanceDirectory, 'runtime', 'java');
  const jlinkExecutable = process.platform === 'win32' ? 'jlink.exe' : 'jlink';

  logStep('Создаём локальный Java runtime через jlink...');
  await ensureDir(path.dirname(runtimeDirectory));
  await runCommand(jlinkExecutable, [
    '--add-modules',
    'ALL-MODULE-PATH',
    '--strip-debug',
    '--no-header-files',
    '--no-man-pages',
    '--compress=zip-6',
    '--output',
    runtimeDirectory,
  ]);
}

function getNeoForgeInstallerUrl(config: LauncherStaticConfig) {
  return [
    'https://maven.neoforged.net/releases/net/neoforged/neoforge',
    config.minecraft.neoForgeVersion,
    `neoforge-${config.minecraft.neoForgeVersion}-installer.jar`,
  ].join('/');
}

function getNeoForgeInstallerLibraryPath(
  baseDirectory: string,
  neoForgeVersion: string,
) {
  const minecraftFolder = MinecraftFolder.from(baseDirectory);
  const installerPath = LibraryInfo.resolve(
    `net.neoforged:neoforge:${neoForgeVersion}:installer`,
  ).path;

  return minecraftFolder.getLibraryByPath(installerPath);
}

async function installNeoForgeFromInstallerJar(
  config: LauncherStaticConfig,
  instanceDirectory: string,
  installerJarPath: string,
  downloadOptions: ReturnType<typeof createDownloadOptions>,
) {
  const minecraftFolder = MinecraftFolder.from(instanceDirectory);
  const zip = await open(installerJarPath, { autoClose: false, lazyEntries: true });

  try {
    const entries = await walkForgeInstallerEntries(zip, config.minecraft.neoForgeVersion);

    if (!entries.installProfileJson) {
      throw new Error(`NeoForge installer does not contain install_profile.json: ${installerJarPath}`);
    }

    if (!isForgeInstallerEntries(entries)) {
      throw new Error(`NeoForge installer format is not supported: ${installerJarPath}`);
    }

    const profile = JSON.parse(
      (await readEntry(zip, entries.installProfileJson)).toString(),
    );

    const versionId = await unpackForgeInstaller(
      zip,
      entries,
      profile,
      minecraftFolder,
      installerJarPath,
      {
        ...downloadOptions,
        versionId: config.minecraft.defaultVersionId,
      },
    );

    const resolvedVersion = await Version.parse(instanceDirectory, versionId);
    const installProfileLibraries = Version.resolveLibraries(profile.libraries);

    logStep('Предзагружаем библиотеки NeoForge с полной проверкой контрольных сумм...');
    await prefetchLibraries(
      [
        ...installProfileLibraries,
        ...resolvedVersion.libraries,
      ],
      instanceDirectory,
      downloadOptions,
    );

    await installByProfile(profile, instanceDirectory, {
      ...downloadOptions,
    });

    return versionId;
  } finally {
    zip.close();
  }
}

async function prepareDistribution() {
  const config = await readJson(path.join(rootDirectory, 'launcher.config.json')) as LauncherStaticConfig;
  const instanceDirectory = path.join(workingDirectory, config.minecraft.instanceFolderName);
  const downloadOptions = createDownloadOptions();
  const installerJarPath = getNeoForgeInstallerLibraryPath(
    installerCacheDirectory,
    config.minecraft.neoForgeVersion,
  );

  try {
    if (await prepareDistributionFromReadyClient(config)) {
      logStep('Готово. Встроенная игра будет взята из папки client.');
      return;
    }

    await emptyDir(workingDirectory);
    await emptyDir(outputDirectory);
    await ensureDir(instanceDirectory);

    logStep(`Устанавливаем базовую версию Minecraft ${config.minecraft.version}...`);
    const versionList = await getVersionList();
    const minecraftVersion = versionList.versions.find((entry) => entry.id === config.minecraft.version);
    if (!minecraftVersion) {
      throw new Error(`Minecraft version ${config.minecraft.version} was not found in official manifest.`);
    }
    await withRetries(
      'Загрузка базовой версии',
      3,
      () => installVersion(minecraftVersion, instanceDirectory, {
        side: 'client',
        ...downloadOptions,
      }),
    );

    logStep(`Скачиваем NeoForge installer ${config.minecraft.neoForgeVersion}...`);
    await downloadFileWithFallback(
      getNeoForgeInstallerUrl(config),
      installerJarPath,
    );

    logStep('Устанавливаем NeoForge из install_profile без Java installer...');
    const versionId = await withRetries(
      'Установка NeoForge',
      3,
      () => installNeoForgeFromInstallerJar(
        config,
        instanceDirectory,
        installerJarPath,
        downloadOptions,
      ),
    );

    logStep('Проверяем и докачиваем все зависимости сборки...');
    const resolvedVersion = await Version.parse(instanceDirectory, versionId);
    await withRetries(
      'Скачивание библиотек и ассетов',
      4,
      () => installDependencies(resolvedVersion, downloadOptions),
    );

    logStep('Копируем моды, конфиги и пользовательские файлы сборки...');
    await copyInstanceOverrides(instanceDirectory);

    await createBundledRuntime(instanceDirectory);

    const manifest: DistributionManifest = {
      distributionVersion: config.distributionVersion,
      launcherVersion: config.launcherVersion,
      minecraftVersion: config.minecraft.version,
      neoForgeVersion: config.minecraft.neoForgeVersion,
      versionId,
      builtAt: new Date().toISOString(),
    };

    await writeJson(
      path.join(instanceDirectory, DISTRIBUTION_MANIFEST_FILE),
      manifest,
      { spaces: 2 },
    );

    logStep('Сохраняем готовую офлайн-сборку в build/offline-distribution...');
    await copy(instanceDirectory, outputDirectory, { overwrite: true });

    logStep('Готово. Офлайн-клиент упакован и будет включён в релиз лаунчера.');
  } finally {
    await downloadOptions.dispatcher.close().catch(() => undefined);
  }
}

async function prepareDistributionClean() {
  const config = await readJson(path.join(rootDirectory, 'launcher.config.json')) as LauncherStaticConfig;
  const instanceDirectory = path.join(workingDirectory, config.minecraft.instanceFolderName);
  const downloadOptions = createDownloadOptions();
  const installerJarPath = getNeoForgeInstallerLibraryPath(
    installerCacheDirectory,
    config.minecraft.neoForgeVersion,
  );
  const detectedClientVersion = await detectReadyClientVersion(config);

  try {
    if (detectedClientVersion) {
      logStep(`Найден готовый клиент в client (${detectedClientVersion.versionId}). Используем его как источник модов, конфигов и пользовательских файлов поверх чистой сборки NeoForge.`);
    }

    await emptyDir(workingDirectory);
    await emptyDir(outputDirectory);
    await ensureDir(instanceDirectory);

    logStep(`Устанавливаем базовую версию Minecraft ${config.minecraft.version}...`);
    const versionList = await getVersionList();
    const minecraftVersion = versionList.versions.find((entry) => entry.id === config.minecraft.version);
    if (!minecraftVersion) {
      throw new Error(`Minecraft version ${config.minecraft.version} was not found in official manifest.`);
    }

    await withRetries(
      'Загрузка базовой версии',
      3,
      () => installVersion(minecraftVersion, instanceDirectory, {
        side: 'client',
        ...downloadOptions,
      }),
    );

    logStep(`Скачиваем NeoForge installer ${config.minecraft.neoForgeVersion}...`);
    await downloadFileWithFallback(
      getNeoForgeInstallerUrl(config),
      installerJarPath,
    );

    logStep('Устанавливаем чистый NeoForge из install_profile...');
    const versionId = await withRetries(
      'Установка NeoForge',
      3,
      () => installNeoForgeFromInstallerJar(
        config,
        instanceDirectory,
        installerJarPath,
        downloadOptions,
      ),
    );

    logStep('Проверяем и докачиваем зависимости сборки...');
    const resolvedVersion = await Version.parse(instanceDirectory, versionId);
    await withRetries(
      'Скачивание библиотек и ассетов',
      4,
      () => installDependencies(resolvedVersion, downloadOptions),
    );

    if (detectedClientVersion) {
      logStep('Переносим из client моды, конфиги и пользовательские файлы...');
      await copyReadyClientOverrides(instanceDirectory);
    }

    logStep('Накладываем дополнительные файлы из distribution-source...');
    await copyDistributionOverrides(instanceDirectory);

    await createBundledRuntime(instanceDirectory);

    const manifest: DistributionManifest = {
      distributionVersion: config.distributionVersion,
      launcherVersion: config.launcherVersion,
      minecraftVersion: config.minecraft.version,
      neoForgeVersion: config.minecraft.neoForgeVersion,
      versionId,
      builtAt: new Date().toISOString(),
    };

    await writeJson(
      path.join(instanceDirectory, DISTRIBUTION_MANIFEST_FILE),
      manifest,
      { spaces: 2 },
    );

    logStep('Сохраняем готовую офлайн-сборку в build/offline-distribution...');
    await copy(instanceDirectory, outputDirectory, { overwrite: true });

    logStep('Готово. Офлайн-клиент собран на чистом ядре NeoForge и упакован в релиз лаунчера.');
  } finally {
    await downloadOptions.dispatcher.close().catch(() => undefined);
  }
}

void prepareDistributionClean().catch((error) => {
  console.error('\n[Forge World] Сборка офлайн-дистрибутива завершилась ошибкой.');
  console.error(error);
  process.exitCode = 1;
});
