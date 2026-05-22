const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PELibrary = require('pe-library');
const ResEdit = require('resedit');

const RU_RU = { lang: 1049, codepage: 1200 };
const EN_US = { lang: 1033, codepage: 1200 };

const VERSION_STRINGS = {
  CompanyName: 'Iron Halo team',
  FileDescription: 'Official Forge World launcher',
  FileVersion: '3.0.0',
  InternalName: 'Forge World Launcher',
  LegalCopyright: 'Iron Halo team',
  OriginalFilename: 'Forge World Launcher.exe',
  ProductName: 'Forge World Launcher',
  ProductVersion: '3.0',
};

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileWithRetry(filePath, data) {
  let lastError;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.writeFileSync(filePath, data);
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM'].includes(error.code)) {
        throw error;
      }
      sleep(250);
    }
  }

  throw lastError;
}

function patchWindowsMetadata(executablePath, overrides = {}) {
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Executable not found: ${executablePath}`);
  }

  const data = fs.readFileSync(executablePath);
  const exe = PELibrary.NtExecutable.from(data, { ignoreCert: true });
  const res = PELibrary.NtExecutableResource.from(exe);
  const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];

  if (!versionInfo) {
    throw new Error(`Version resource not found: ${executablePath}`);
  }

  for (const language of versionInfo.getAllLanguagesForStringValues()) {
    versionInfo.removeAllStringValues(language);
  }

  versionInfo.replaceAvailableLanguages([RU_RU]);
  versionInfo.setFileVersion(3, 0, 0, 0, RU_RU.lang);
  versionInfo.setProductVersion(3, 0, 0, 0, RU_RU.lang);
  versionInfo.removeAllStringValues(EN_US);
  versionInfo.setStringValues(RU_RU, { ...VERSION_STRINGS, ...overrides }, true);
  versionInfo.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  writeFileWithRetry(executablePath, Buffer.from(exe.generate()));
}

function sha512Base64(filePath) {
  return crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64');
}

function patchLatestYml(releaseDir, installerName) {
  const latestPath = path.join(releaseDir, 'latest.yml');
  const installerPath = path.join(releaseDir, installerName);

  if (!fs.existsSync(latestPath) || !fs.existsSync(installerPath)) {
    return;
  }

  const hash = sha512Base64(installerPath);
  const size = fs.statSync(installerPath).size;
  const latest = fs.readFileSync(latestPath, 'utf8')
    .replace(/sha512: .+/g, `sha512: ${hash}`)
    .replace(/size: \d+/g, `size: ${size}`);

  fs.writeFileSync(latestPath, latest);
}

function patchReleaseMetadata(rootDir = process.cwd()) {
  const releaseDir = path.join(rootDir, 'release');
  const appExe = path.join(releaseDir, 'win-unpacked', 'Forge World Launcher.exe');
  const installerName = 'Forge-World-Launcher-3.0.exe';
  const installerExe = path.join(releaseDir, installerName);

  if (fs.existsSync(appExe)) {
    patchWindowsMetadata(appExe);
  }

  if (fs.existsSync(installerExe)) {
    patchWindowsMetadata(installerExe, {
      OriginalFilename: installerName,
    });
    patchLatestYml(releaseDir, installerName);
  }

  for (const generatedFile of [
    'builder-debug.yml',
    'Forge-World-Launcher-3.0.exe.blockmap',
    'Forge-World-Launcher-1.2.0.exe.blockmap',
  ]) {
    fs.rmSync(path.join(releaseDir, generatedFile), { force: true });
  }
}

if (require.main === module) {
  if (process.argv.includes('--release')) {
    patchReleaseMetadata();
  } else {
    for (const executablePath of process.argv.slice(2)) {
      patchWindowsMetadata(path.resolve(executablePath));
    }
  }
}

module.exports = {
  patchReleaseMetadata,
  patchWindowsMetadata,
};
