import { readJson } from 'fs-extra';
import { z } from 'zod';
import type {
  LauncherContent,
  LauncherStaticConfig,
  LauncherUpdateInfo,
} from '../src/shared/contracts';
import {
  getLauncherConfigPath,
  getLauncherContentPath,
} from './paths';

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
    icon: z.string(),
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

export async function readStaticConfig(): Promise<LauncherStaticConfig> {
  const raw = await readJson(getLauncherConfigPath());
  return staticConfigSchema.parse(raw);
}

export async function readLauncherContent(): Promise<LauncherContent> {
  const raw = await readJson(getLauncherContentPath());
  return contentSchema.parse(raw);
}

export function parseUpdateInfo(raw: unknown): LauncherUpdateInfo {
  return updateInfoSchema.parse(raw);
}
