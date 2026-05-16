import pino from 'pino';

const prettyPrint = process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production';

const pinoOptions = {
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      'passphrase',
      'token',
      'secret',
      'authorization',
      'cookie',
      '*.password',
      '*.passphrase',
      '*.token',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
};

const transport = prettyPrint
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    })
  : undefined;

export const logger = pino(pinoOptions, transport);

/**
 * Create a child logger with additional context.
 * @param {Record<string, unknown>} context
 * @returns {pino.Logger}
 */
export function createChildLogger(context) {
  return logger.child(context);
}
