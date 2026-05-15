import { queryStatus } from '@xmcl/client';
import type {
  LauncherStaticConfig,
  ServerStatusPayload,
} from '../src/shared/contracts';

function formatPlayers(online: number) {
  return new Intl.NumberFormat('ru-RU').format(online);
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

  try {
    const status = await queryStatus({
      host,
      port: config.minecraft.server.port,
    }, {
      timeout: 3000,
      retryTimes: 1,
    });

    return {
      online: true,
      displayText: formatPlayers(status.players.online),
      playersOnline: status.players.online,
      maxPlayers: status.players.max,
      latencyMs: status.ping,
    };
  } catch (error) {
    return {
      online: false,
      displayText: 'OFFLINE',
      error: error instanceof Error ? error.message : 'Не удалось получить статус сервера',
    };
  }
}
