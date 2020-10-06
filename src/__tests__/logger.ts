
import { ConsoleLogger, IConsoleLoggerSettings } from '@cdm-logger/server';
import { CdmLogger } from '@cdm-logger/core';
type Logger = CdmLogger.ILogger;

const settings: IConsoleLoggerSettings = {
    level: 'trace',
};

export const logger: Logger = ConsoleLogger.create('nats-subcscription', settings);
