import { spawn } from 'node:child_process';

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

  await run(npmCommand, ['run', 'patch:deps']);
  await run(npmCommand, ['run', 'prepare:distribution']);
  await run(npmCommand, ['run', 'build']);
  await run(electronBuilderCommand, isDirBuild ? ['--dir'] : []);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
