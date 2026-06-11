import { readJson } from 'fs-extra';
import os from 'node:os';
import { z } from 'zod';
import type {
  LauncherContent,
  LauncherStaticConfig,
  LauncherUpdateInfo,
} from '../src/shared/contracts';
import { getLauncherConfigPath } from './paths';

const staticConfigSchema = z.object({
  appId: z.string(),
  launcherVersion: z.string(),
  distributionVersion: z.string(),
  branding: z.object({
    projectName: z.string(),
    subtitle: z.array(z.string()).min(1),
    supportTitle: z.string().optional(),
    supportText: z.string().optional(),
  }),
  minecraft: z.object({
    version: z.string(),
    neoForgeVersion: z.string(),
    defaultVersionId: z.string(),
    instanceFolderName: z.string(),
    defaultRamMb: z.number().int().positive(),
    minimumRamMb: z.number().int().positive(),
    maximumRamMb: z.number().int().positive(),
    minimumLaunchRamMb: z.number().int().positive(),
    directConnectOnLaunch: z.boolean(),
    server: z.object({
      host: z.string(),
      port: z.number().int().positive(),
      displayName: z.string(),
    }),
  }),
  links: z.object({
    site: z.string().url().optional(),
    discord: z.string().url(),
    wiki: z.string().url(),
    github: z.string().url(),
    support: z.string().url().optional(),
  }),
  update: z.object({
    metadataUrl: z.string().url(),
    downloadPage: z.string().url(),
  }),
  content: z.object({
    remoteUrl: z.string().url(),
    checkIntervalMs: z.number().int().positive(),
  }),
  auth: z.object({
    enabled: z.boolean(),
    baseUrl: z.union([z.string().url(), z.literal('')]),
    fallbackBaseUrl: z.union([z.string().url(), z.literal('')]).optional(),
    hostHeader: z.string().optional(),
    requestTimeoutMs: z.number().int().positive(),
  }),
  preserveOnUpdate: z.array(z.string()),
});

const contentSchema = z.object({
  newsTitle: z.string(),
  timelineTitle: z.string(),
  timelineSubtitle: z.string(),
  news: z.array(z.object({
    id: z.string(),
    title: z.string(),
    date: z.string(),
    text: z.string(),
    icon: z.string().optional(),
    url: z.union([z.string().url(), z.literal('')]).optional(),
  })),
  timeline: z.array(z.object({
    id: z.string(),
    year: z.string(),
    title: z.string(),
    text: z.string(),
    icon: z.string(),
    url: z.union([z.string().url(), z.literal('')]).optional(),
  })),
});

const updateInfoSchema = z.object({
  latestVersion: z.string(),
  title: z.string().optional(),
  notes: z.string().optional(),
  publishedAt: z.string().optional(),
  downloadUrl: z.string().url().optional(),
});

type StaticConfigInput = z.infer<typeof staticConfigSchema>;

export async function readStaticConfig(): Promise<LauncherStaticConfig> {
  const raw = await readJson(getLauncherConfigPath());
  return applyDeviceMemoryLimits(staticConfigSchema.parse(raw));
}

function roundDownToStep(value: number, step: number) {
  return Math.max(step, Math.floor(value / step) * step);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRecommendedRam(totalRamMb: number) {
  if (totalRamMb <= 8192) {
    return 4096;
  }

  if (totalRamMb <= 12288) {
    return 5120;
  }

  if (totalRamMb <= 24576) {
    return 6144;
  }

  return 8192;
}

function getMaximumRam(totalRamMb: number, config: StaticConfigInput) {
  const reserveRamMb = totalRamMb <= 8192
    ? 1024
    : totalRamMb <= 16384
      ? 2048
      : totalRamMb <= 32768
        ? 4096
        : 6144;
  const deviceMaximumRamMb = roundDownToStep(totalRamMb - reserveRamMb, 512);

  return clamp(
    deviceMaximumRamMb,
    config.minecraft.minimumRamMb,
    config.minecraft.maximumRamMb,
  );
}

function getSafeMaximumRam(totalRamMb: number, config: StaticConfigInput) {
  const recommendedRamMb = getRecommendedRam(totalRamMb);
  const safeMaximumRamMb = roundDownToStep(totalRamMb * 0.75, 512);

  return clamp(
    Math.max(recommendedRamMb, safeMaximumRamMb),
    config.minecraft.minimumRamMb,
    getMaximumRam(totalRamMb, config),
  );
}

function applyDeviceMemoryLimits(config: StaticConfigInput): LauncherStaticConfig {
  const totalRamMb = Math.floor(os.totalmem() / 1024 / 1024);
  const maximumRamMb = getMaximumRam(totalRamMb, config);
  const recommendedRamMb = clamp(
    Math.min(config.minecraft.defaultRamMb, getRecommendedRam(totalRamMb)),
    config.minecraft.minimumRamMb,
    maximumRamMb,
  );
  const safeMaximumRamMb = getSafeMaximumRam(totalRamMb, config);
  const defaultRamMb = clamp(
    recommendedRamMb,
    config.minecraft.minimumRamMb,
    maximumRamMb,
  );

  return {
    ...config,
    minecraft: {
      ...config.minecraft,
      defaultRamMb: roundDownToStep(defaultRamMb, 512),
      maximumRamMb,
      recommendedRamMb: roundDownToStep(recommendedRamMb, 512),
      safeMaximumRamMb,
      deviceTotalRamMb: totalRamMb,
    },
  };
}

export function parseLauncherContent(raw: unknown): LauncherContent {
  return contentSchema.parse(raw);
}

export function parseUpdateInfo(raw: unknown): LauncherUpdateInfo {
  return updateInfoSchema.parse(raw);
}
