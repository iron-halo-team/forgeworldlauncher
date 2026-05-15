import path from 'node:path';
import {
  readFile,
  writeFile,
} from 'node:fs/promises';

type PackageJson = {
  exports?: Record<string, unknown>;
};

async function patchXmclBytebuffer(root: string) {
  const packageJsonPath = path.join(
    root,
    'node_modules',
    '@xmcl',
    'bytebuffer',
    'package.json',
  );

  const raw = await readFile(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw) as PackageJson;
  const exportsField = parsed.exports;

  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return false;
  }

  const replacements = new Map([
    ['debug', './debug'],
    ['hex', './hex'],
    ['varint32', './varint32'],
    ['varint64', './varint64'],
  ]);

  let changed = false;
  for (const [from, to] of replacements) {
    if (from in exportsField && !(to in exportsField)) {
      exportsField[to] = exportsField[from];
      delete exportsField[from];
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  await writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return true;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const patched = await patchXmclBytebuffer(root);

  if (patched) {
    console.log('Patched @xmcl/bytebuffer package exports for Electron runtime compatibility.');
  } else {
    console.log('Dependency patch not required.');
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
