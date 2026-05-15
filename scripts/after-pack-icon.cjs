const { execFile } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stdout || ''}${stderr || ''}`));
        return;
      }

      resolve();
    });
  });
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const iconPath = path.join(context.packager.projectDir, 'ico', 'forgeworld_multisize.ico');
  const rceditPath = path.join(context.packager.projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  const executablePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);

  if (!existsSync(iconPath)) {
    throw new Error(`Launcher icon not found: ${iconPath}`);
  }

  if (!existsSync(rceditPath)) {
    throw new Error(`rcedit not found: ${rceditPath}`);
  }

  if (!existsSync(executablePath)) {
    throw new Error(`Packed launcher executable not found: ${executablePath}`);
  }

  await run(rceditPath, [
    executablePath,
    '--set-icon',
    iconPath,
  ]);
};
