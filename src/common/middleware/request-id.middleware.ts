import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from '../types/request-with-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);
  private readonly debugForwarded: boolean;

  constructor(config: ConfigService) {
    this.debugForwarded =
      config.get<string>('DEBUG_FORWARDED', 'false') === 'true';
  }

  use(request: RequestWithId, response: Response, next: NextFunction) {
    const requestId = randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    if (this.debugForwarded) {
      this.logger.warn(
        JSON.stringify({
          event: 'FORWARDED_DEBUG',
          requestId,
          remoteAddress: request.socket.remoteAddress ?? null,
          ip: request.ip ?? null,
          xRealIp: request.get('x-real-ip') ?? null,
          xForwardedFor: request.get('x-forwarded-for') ?? null,
        }),
      );
    }

    next();
  }
}
