type LogLevel = 'info' | 'warn' | 'error';

interface LogInput {
  level: LogLevel;
  message: string;
  meta?: object;
}

interface LogWithRequestId extends LogInput {
  requestId: string;
}

const LOG_LEVELS: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function formatLog(entry: LogWithRequestId): string {
  const timestamp = new Date().toISOString();
  const levelStr = LOG_LEVELS[entry.level];
  const metaStr = JSON.stringify(entry.meta || {});
  return `[${timestamp}] [${levelStr}] [${entry.requestId}] ${entry.message} ${metaStr}`;
}

function logWithRequestId(requestId: string, input: LogInput): void {
  const entry: LogWithRequestId = { ...input, requestId };
  const formatted = formatLog(entry);
  if (input.level === 'error') {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
}

// Singleton log proxy — calling log({ level, message, meta }) uses '-' as requestId placeholder
const log = (input: LogInput, requestId?: string): void => {
  logWithRequestId(requestId || '-', input);
};

export const logger = {
  info: (message: string, meta?: object, requestId?: string) =>
    logWithRequestId(requestId || '-', { level: 'info', message, meta }),
  warn: (message: string, meta?: object, requestId?: string) =>
    logWithRequestId(requestId || '-', { level: 'warn', message, meta }),
  error: (message: string, meta?: object, requestId?: string) =>
    logWithRequestId(requestId || '-', { level: 'error', message, meta }),
};

export type { LogLevel, LogInput };
export default log;
