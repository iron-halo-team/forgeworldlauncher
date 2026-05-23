import * as http from 'node:http';
import * as https from 'node:https';
import net from 'node:net';
import { promises as dns } from 'node:dns';
import { URL } from 'node:url';
import type {
  LauncherStaticConfig,
  ServerStatusPayload,
} from '../src/shared/contracts';

interface StatusRequestTarget {
  url: string;
  hostHeader?: string;
}

interface RelayServerStatus {
  ok?: boolean;
  online?: boolean;
  displayText?: string;
  playersOnline?: number | string;
  maxPlayers?: number | string;
  players?: unknown;
  message?: string;
  latencyMs?: number | string;
}

interface MinecraftStatusResponse {
  version?: {
    name?: string;
    protocol?: number;
  };
  players?: {
    max?: number;
    online?: number;
  };
  description?: unknown;
}

interface ResolvedMinecraftTarget {
  connectHost: string;
  handshakeHost: string;
  port: number;
}

function formatPlayers(online: number) {
  return new Intl.NumberFormat('ru-RU').format(online);
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function createRequestTargets(config: LauncherStaticConfig, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryBaseUrl = normalizeBaseUrl(config.auth.baseUrl);
  const targets: StatusRequestTarget[] = [
    {
      url: `${primaryBaseUrl}${normalizedPath}`,
    },
  ];

  const fallbackBaseUrl = config.auth.fallbackBaseUrl?.trim()
    ? normalizeBaseUrl(config.auth.fallbackBaseUrl)
    : '';
  if (fallbackBaseUrl && fallbackBaseUrl !== primaryBaseUrl) {
    targets.push({
      url: `${fallbackBaseUrl}${normalizedPath}`,
      hostHeader: config.auth.hostHeader?.trim() || undefined,
    });
  }

  return targets;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value);
  }

  return fallback;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value);
  }

  return undefined;
}

function encodeVarInt(value: number) {
  const bytes: number[] = [];
  let next = value >>> 0;

  do {
    let byte = next & 0x7f;
    next >>>= 7;
    if (next !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (next !== 0);

  return Buffer.from(bytes);
}

function encodeString(value: string) {
  const text = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarInt(text.length), text]);
}

function createPacket(...parts: Buffer[]) {
  const body = Buffer.concat(parts);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

function readVarInt(buffer: Buffer, offset: number) {
  let value = 0;
  let position = 0;

  for (let index = 0; index < 5; index += 1) {
    if (offset + index >= buffer.length) {
      return null;
    }

    const byte = buffer[offset + index];
    value |= (byte & 0x7f) << position;

    if ((byte & 0x80) === 0) {
      return {
        value,
        bytesRead: index + 1,
      };
    }

    position += 7;
  }

  throw new Error('Некорректный ответ сервера.');
}

function tryReadPacket(buffer: Buffer) {
  const length = readVarInt(buffer, 0);
  if (!length) {
    return null;
  }

  const packetStart = length.bytesRead;
  const packetEnd = packetStart + length.value;
  if (buffer.length < packetEnd) {
    return null;
  }

  return {
    packet: buffer.subarray(packetStart, packetEnd),
    rest: buffer.subarray(packetEnd),
  };
}

function createStatusHandshake(host: string, port: number) {
  const protocolVersion = 767; // Minecraft 1.21.1
  const portBuffer = Buffer.allocUnsafe(2);
  portBuffer.writeUInt16BE(port, 0);

  return createPacket(
    encodeVarInt(0),
    encodeVarInt(protocolVersion),
    encodeString(host),
    portBuffer,
    encodeVarInt(1),
  );
}

function createStatusRequest() {
  return createPacket(encodeVarInt(0));
}

function parseStatusPacket(packet: Buffer): MinecraftStatusResponse {
  const packetId = readVarInt(packet, 0);
  if (!packetId || packetId.value !== 0) {
    throw new Error('Сервер вернул неизвестный status-пакет.');
  }

  const stringLength = readVarInt(packet, packetId.bytesRead);
  if (!stringLength) {
    throw new Error('Сервер вернул неполный status-ответ.');
  }

  const jsonStart = packetId.bytesRead + stringLength.bytesRead;
  const jsonEnd = jsonStart + stringLength.value;
  if (packet.length < jsonEnd) {
    throw new Error('Сервер вернул обрезанный status-ответ.');
  }

  return JSON.parse(packet.subarray(jsonStart, jsonEnd).toString('utf8')) as MinecraftStatusResponse;
}

async function resolveMinecraftTarget(host: string, port: number): Promise<ResolvedMinecraftTarget> {
  try {
    const records = await Promise.race([
      dns.resolveSrv(`_minecraft._tcp.${host}`),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('SRV lookup timeout')), 1200);
      }),
    ]);
    const sortedRecords = records
      .filter((record) => record.name && record.port > 0)
      .sort((left, right) => left.priority - right.priority || right.weight - left.weight);
    const selectedRecord = sortedRecords[0];

    if (selectedRecord) {
      return {
        connectHost: selectedRecord.name,
        handshakeHost: host,
        port: selectedRecord.port,
      };
    }
  } catch {
    // No SRV record is a normal case for direct host:port servers.
  }

  return {
    connectHost: host,
    handshakeHost: host,
    port,
  };
}

function queryMinecraftStatus(target: ResolvedMinecraftTarget, timeoutMs: number) {
  return new Promise<ServerStatusPayload>((resolve, reject) => {
    const startedAt = Date.now();
    const socket = net.createConnection({
      host: target.connectHost,
      port: target.port,
    });
    let buffer = Buffer.alloc(0);
    let settled = false;

    function finish(error?: Error, status?: ServerStatusPayload) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve(status!);
      }
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(createStatusHandshake(target.handshakeHost, target.port));
      socket.write(createStatusRequest());
    });

    socket.on('data', (chunk) => {
      try {
        buffer = Buffer.concat([
          buffer,
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        ]);
        const result = tryReadPacket(buffer);
        if (!result) {
          return;
        }

        const response = parseStatusPacket(result.packet);
        const playersOnline = toNumber(response.players?.online);
        const maxPlayers = toNumber(response.players?.max);

        finish(undefined, {
          online: true,
          displayText: formatPlayers(playersOnline),
          playersOnline,
          maxPlayers,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Не удалось прочитать статус сервера.'));
      }
    });

    socket.once('timeout', () => finish(new Error('Сервер не ответил вовремя.')));
    socket.once('error', (error) => {
      finish(error instanceof Error ? error : new Error('Не удалось подключиться к серверу.'));
    });
    socket.once('close', () => {
      finish(new Error('Сервер закрыл соединение до ответа.'));
    });
  });
}

function requestStatusTarget<T>(
  target: StatusRequestTarget,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const url = new URL(target.url);
    const transport = url.protocol === 'https:' ? https : http;
    const startedAt = Date.now();

    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'ForgeWorldLauncher/3.0',
    };
    if (target.hostHeader) {
      headers.host = target.hostHeader;
    }

    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      method: 'GET',
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
        try {
          const payload = rawBody ? JSON.parse(rawBody) as T & { latencyMs?: number } : null;
          if (!payload) {
            reject(new Error('Пустой ответ сервера статуса.'));
            return;
          }

          payload.latencyMs = Date.now() - startedAt;
          resolve(payload);
        } catch {
          reject(new Error('Сервер статуса вернул некорректный ответ.'));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    });
    request.on('error', reject);
    request.end();
  });
}

async function fetchRelayServerStatus(config: LauncherStaticConfig) {
  if (!config.auth.enabled || !config.auth.baseUrl) {
    throw new Error('Relay статуса не настроен.');
  }

  const timeoutMs = Math.max(2000, Math.min(config.auth.requestTimeoutMs, 4000));
  const targets = createRequestTargets(config, '/server/status/');

  return new Promise<RelayServerStatus>((resolve, reject) => {
    let pendingCount = targets.length;
    let isResolved = false;
    let lastError: unknown = null;

    for (const target of targets) {
      void requestStatusTarget<RelayServerStatus>(target, timeoutMs)
        .then((status) => {
          if (isResolved) {
            return;
          }

          isResolved = true;
          resolve(status);
        })
        .catch((error) => {
          lastError = error;
          pendingCount -= 1;

          if (!isResolved && pendingCount === 0) {
            reject(lastError instanceof Error
              ? lastError
              : new Error('Сервер статуса сейчас недоступен.'));
          }
        });
    }
  });
}

async function fetchDirectMinecraftStatus(config: LauncherStaticConfig) {
  const target = await resolveMinecraftTarget(
    config.minecraft.server.host,
    config.minecraft.server.port,
  );

  try {
    return await queryMinecraftStatus(target, 2500);
  } catch {
    // Some modded hosts accept TCP but do not answer the vanilla status packet.
  }

  const reachable = await checkTcpReachable(target, 3500);
  return {
    online: true,
    displayText: 'ONLINE',
    latencyMs: reachable.latencyMs,
    error: 'Сервер отвечает, но список игроков пока недоступен.',
  };
}

function checkTcpReachable(target: ResolvedMinecraftTarget, timeoutMs: number) {
  return new Promise<{ latencyMs: number }>((resolve, reject) => {
    const startedAt = Date.now();
    const socket = net.createConnection({
      host: target.connectHost,
      port: target.port,
    });
    let settled = false;

    function finish(error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve({
          latencyMs: Date.now() - startedAt,
        });
      }
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error('Сервер не ответил вовремя.')));
    socket.once('error', (error) => {
      finish(error instanceof Error ? error : new Error('Не удалось подключиться к серверу.'));
    });
    socket.once('close', () => {
      finish(new Error('Сервер закрыл соединение.'));
    });
  });
}

function buildRelayStatus(relayStatus: RelayServerStatus): ServerStatusPayload {
  const playersOnline = toNumber(relayStatus.playersOnline);
  const maxPlayers = toNumber(relayStatus.maxPlayers);
  const online = relayStatus.online === true;
  const players = Array.isArray(relayStatus.players)
    ? relayStatus.players.filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
    : undefined;

  return {
    online,
    displayText: online
      ? relayStatus.displayText || formatPlayers(playersOnline)
      : 'OFFLINE',
    playersOnline: online ? playersOnline : undefined,
    maxPlayers: online ? maxPlayers : undefined,
    players: online ? players : undefined,
    latencyMs: toOptionalNumber(relayStatus.latencyMs),
    error: online
      ? undefined
      : relayStatus.message || 'Сервер сейчас недоступен.',
  };
}

export async function fetchServerStatus(
  config: LauncherStaticConfig,
): Promise<ServerStatusPayload | null> {
  const host = config.minecraft.server.host;

  if (!host || host.includes('example')) {
    return {
      online: false,
      displayText: 'OFFLINE',
      error: 'Укажите реальный адрес сервера в launcher.config.json',
    };
  }

  let relayStatus: ServerStatusPayload | null = null;
  try {
    relayStatus = buildRelayStatus(await fetchRelayServerStatus(config));
    if (relayStatus.online) {
      return relayStatus;
    }
  } catch {
    // Direct Minecraft probing below is a fallback when the bridge is unavailable.
  }

  try {
    const directStatus = await fetchDirectMinecraftStatus(config);
    if (directStatus.online) {
      return directStatus;
    }
  } catch {
    // Fall back to the bridge error below, if it returned a structured offline state.
  }

  if (relayStatus) {
    return relayStatus;
  }

  return {
    online: false,
    displayText: 'OFFLINE',
    error: 'Не удалось получить статус сервера.',
  };
}
