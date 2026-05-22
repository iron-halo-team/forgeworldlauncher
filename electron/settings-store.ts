import { ensureDir, pathExists, readJson, writeJson } from 'fs-extra';
import { z } from 'zod';
import type {
  LauncherSettings,
  LauncherStaticConfig,
} from '../src/shared/contracts';
import { getSettingsPath, getUserDataRoot } from './paths';

const settingsPatchSchema = z.object({
  username: z.string().trim().regex(/^$|^[A-Za-z0-9_]{3,16}$/).optional(),
  authToken: z.string().optional(),
  authTokenExpiresAt: z.string().optional(),
  allocatedRamMb: z.number().int().min(1024).max(65536).optional(),
  hideLauncherOnGameStart: z.boolean().optional(),
  closeLauncherWhenGameCloses: z.boolean().optional(),
  directConnectOnLaunch: z.boolean().optional(),
});

function getDefaultSettings(config: LauncherStaticConfig): LauncherSettings {
  return {
    username: '',
    authToken: '',
    authTokenExpiresAt: '',
    allocatedRamMb: config.minecraft.defaultRamMb,
    hideLauncherOnGameStart: true,
    closeLauncherWhenGameCloses: false,
    directConnectOnLaunch: config.minecraft.directConnectOnLaunch,
  };
}

function normalizeRamValue(value: number, config: LauncherStaticConfig) {
  const bounded = Math.min(
    config.minecraft.maximumRamMb,
    Math.max(config.minecraft.minimumRamMb, value),
  );

  return Math.round(bounded / 512) * 512;
}

export async function loadSettings(config: LauncherStaticConfig): Promise<LauncherSettings> {
  await ensureDir(getUserDataRoot());
  const settingsPath = getSettingsPath();
  const defaults = getDefaultSettings(config);

  if (!await pathExists(settingsPath)) {
    await writeJson(settingsPath, defaults, { spaces: 2 });
    return defaults;
  }

  const raw = await readJson(settingsPath);
  const parsed = settingsPatchSchema.partial().safeParse(raw);

  if (!parsed.success) {
    await writeJson(settingsPath, defaults, { spaces: 2 });
    return defaults;
  }

  return {
    ...defaults,
    ...parsed.data,
    allocatedRamMb: normalizeRamValue(
      parsed.data.allocatedRamMb ?? defaults.allocatedRamMb,
      config,
    ),
  };
}

export async function saveSettings(
  config: LauncherStaticConfig,
  patch: Partial<LauncherSettings>,
) {
  const validatedPatch = settingsPatchSchema.parse(patch);
  const current = await loadSettings(config);

  const next: LauncherSettings = {
    ...current,
    ...validatedPatch,
    allocatedRamMb: normalizeRamValue(
      validatedPatch.allocatedRamMb ?? current.allocatedRamMb,
      config,
    ),
  };

  await writeJson(getSettingsPath(), next, { spaces: 2 });
  return next;
}
