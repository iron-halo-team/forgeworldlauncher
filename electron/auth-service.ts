import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import type {
  LauncherAccountProfileResult,
  AuthServerStatusPayload,
  LauncherStaticConfig,
} from '../src/shared/contracts';

export interface RemoteAuthResult {
  ok: boolean;
  username: string;
  message: string;
  token?: string;
  expiresAt?: string;
}

interface RemoteProfileResult {
  ok: boolean;
  username: string;
  message: string;
  email?: string;
  hasEmail?: boolean;
  lastLoginAt?: string;
}

interface RemoteSimpleResult {
  ok: boolean;
  message: string;
  hasEmail?: boolean;
}

interface AuthRequestTarget {
  url: string;
  hostHeader?: string;
}

function normalizeBaseUrl(config: LauncherStaticConfig) {
  return config.auth.baseUrl.replace(/\/+$/, '');
}

function normalizeOptionalBaseUrl(value?: string) {
  return value?.trim().replace(/\/+$/, '') ?? '';
}

function normalizeAuthPath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function createRequestTargets(config: LauncherStaticConfig, path: string) {
  const authPath = normalizeAuthPath(path);
  const primaryBaseUrl = normalizeBaseUrl(config);
  const targets: AuthRequestTarget[] = [
    {
      url: `${primaryBaseUrl}${authPath}`,
    },
  ];

  const fallbackBaseUrl = normalizeOptionalBaseUrl(config.auth.fallbackBaseUrl);
  if (fallbackBaseUrl && fallbackBaseUrl !== primaryBaseUrl) {
    targets.push({
      url: `${fallbackBaseUrl}${authPath}`,
      hostHeader: config.auth.hostHeader?.trim() || undefined,
    });
  }

  return targets;
}

function getTimeoutMs(config: LauncherStaticConfig) {
  return Math.max(1500, config.auth.requestTimeoutMs);
}

function createAuthError(message: string) {
  return new Error(message || 'Не удалось выполнить запрос авторизации.');
}

function isNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  const code = 'code' in error ? String(error.code).toLowerCase() : '';
  return (
    error.name === 'AbortError'
    || message.includes('fetch failed')
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('econnrefused')
    || message.includes('econnreset')
    || message.includes('enotfound')
    || message.includes('etimedout')
    || message.includes('getaddrinfo')
    || message.includes('socket hang up')
    || message.includes('self-signed certificate')
    || ['econnrefused', 'econnreset', 'enotfound', 'etimedout', 'eai_again'].includes(code)
  );
}

function getNetworkErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Сервер авторизации сейчас недоступен.';
  }

  if (isNetworkError(error)) {
    return 'Сервер авторизации сейчас недоступен.';
  }

  return error.message;
}

async function requestTargetJson<T>(
  target: AuthRequestTarget,
  timeoutMs: number,
  body?: unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const url = new URL(target.url);
    const payload = body ? JSON.stringify(body) : undefined;
    const transport = url.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'ForgeWorldLauncher/3.0',
    };

    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }

    if (target.hostHeader) {
      headers.host = target.hostHeader;
    }

    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      method: payload ? 'POST' : 'GET',
      path: `${url.pathname}${url.search}`,
      headers,
      timeout: timeoutMs,
    }, (response) => {
      let rawBody = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        rawBody += chunk;
      });
      response.on('end', () => {
        let payloadJson: { ok?: boolean; message?: string } | null = null;

        try {
          payloadJson = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          reject(createAuthError('Сервер авторизации вернул некорректный ответ.'));
          return;
        }

        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300 || payloadJson?.ok === false) {
          reject(createAuthError(
            payloadJson?.message
            ?? `Сервер авторизации ответил ошибкой ${statusCode}.`,
          ));
          return;
        }

        resolve(payloadJson as T);
      });
    });

    request.on('timeout', () => {
      request.destroy(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    });
    request.on('error', reject);

    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function requestJson<T>(
  config: LauncherStaticConfig,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!config.auth.enabled || !config.auth.baseUrl) {
    throw createAuthError('Авторизация через лаунчер не настроена.');
  }

  let lastError: unknown = null;
  for (const target of createRequestTargets(config, path)) {
    try {
      return await requestTargetJson<T>(target, getTimeoutMs(config), body);
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error)) {
        break;
      }
    }
  }

  throw createAuthError(getNetworkErrorMessage(lastError));
}

async function requestFirstHealthyJson<T>(
  config: LauncherStaticConfig,
  path: string,
): Promise<T> {
  if (!config.auth.enabled || !config.auth.baseUrl) {
    throw createAuthError('Авторизация через лаунчер не настроена.');
  }

  const targets = createRequestTargets(config, path);
  const timeoutMs = Math.min(getTimeoutMs(config), 5000);

  return new Promise<T>((resolve, reject) => {
    let pendingCount = targets.length;
    let isResolved = false;
    let lastError: unknown = null;

    for (const target of targets) {
      void requestTargetJson<T>(target, timeoutMs)
        .then((result) => {
          if (isResolved) {
            return;
          }

          isResolved = true;
          resolve(result);
        })
        .catch((error) => {
          lastError = error;
          pendingCount -= 1;

          if (!isResolved && pendingCount === 0) {
            reject(createAuthError(getNetworkErrorMessage(lastError)));
          }
        });
    }
  });
}

export async function checkLauncherAuthStatus(
  config: LauncherStaticConfig,
): Promise<AuthServerStatusPayload> {
  const checkedAt = new Date().toISOString();

  if (!config.auth.enabled || !config.auth.baseUrl) {
    return {
      online: false,
      message: 'Авторизация через лаунчер не настроена.',
      checkedAt,
    };
  }

  try {
    await requestFirstHealthyJson(config, '/auth/health/');
    return {
      online: true,
      message: 'Сервер авторизации доступен.',
      checkedAt,
    };
  } catch (error) {
    return {
      online: false,
      message: error instanceof Error
        ? error.message
        : 'Нет подключения к интернету.',
      checkedAt,
    };
  }
}

export function loginLauncherAccount(
  config: LauncherStaticConfig,
  username: string,
  password: string,
) {
  return requestJson<RemoteAuthResult>(config, '/auth/login/', {
    username,
    password,
  });
}

export function registerLauncherAccount(
  config: LauncherStaticConfig,
  username: string,
  password: string,
  email?: string,
) {
  return requestJson<RemoteAuthResult>(config, '/auth/register/', {
    username,
    password,
    email: email?.trim() ?? '',
  });
}

export function prepareLauncherAuthSession(
  config: LauncherStaticConfig,
  username: string,
  token: string,
) {
  return requestJson<RemoteAuthResult>(config, '/auth/session/', {
    username,
    token,
  });
}

export function logoutLauncherAccount(
  config: LauncherStaticConfig,
  username: string,
  token: string,
) {
  if (!username || !token) {
    return Promise.resolve<RemoteAuthResult>({
      ok: true,
      username,
      message: 'Выход выполнен.',
    });
  }

  return requestJson<RemoteAuthResult>(config, '/auth/logout/', {
    username,
    token,
  });
}

function normalizeProfileResult(result: RemoteProfileResult): LauncherAccountProfileResult {
  return {
    ok: result.ok,
    message: result.message,
    profile: {
      username: result.username,
      email: result.email ?? '',
      hasEmail: result.hasEmail === true || Boolean(result.email),
      lastLoginAt: result.lastLoginAt ?? '',
    },
  };
}

export async function getLauncherAccountProfile(
  config: LauncherStaticConfig,
  username: string,
  token: string,
) {
  const result = await requestJson<RemoteProfileResult>(config, '/auth/profile/', {
    username,
    token,
  });
  return normalizeProfileResult(result);
}

export async function updateLauncherAccountEmail(
  config: LauncherStaticConfig,
  username: string,
  token: string,
  email: string,
) {
  const result = await requestJson<RemoteProfileResult>(config, '/auth/email/', {
    username,
    token,
    email,
  });
  return normalizeProfileResult(result);
}

export function changeLauncherAccountPassword(
  config: LauncherStaticConfig,
  username: string,
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  return requestJson<RemoteSimpleResult>(config, '/auth/password/', {
    username,
    token,
    currentPassword,
    newPassword,
  });
}

export function startLauncherPasswordRecovery(
  config: LauncherStaticConfig,
  username: string,
) {
  return requestJson<RemoteSimpleResult>(config, '/auth/recovery/', {
    username,
  });
}
