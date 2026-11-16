import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware';
import type { RequestWithId } from '../types/request-with-id';

function createRequest(forwarded: Record<string, string> = {}): RequestWithId {
  return {
    socket: { remoteAddress: '100.64.0.9' },
    ip: '198.51.100.20',
    get: (header: string) => forwarded[header.toLowerCase()] ?? null,
  } as unknown as RequestWithId;
}

function createResponse(): Response {
  return { setHeader: jest.fn() } as unknown as Response;
}

describe('RequestIdMiddleware forwarded diagnostics', () => {
  let warn: jest.SpiedFunction<typeof Logger.prototype.warn>;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    next = jest.fn();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function middleware(config: Record<string, string>) {
    const configService = {
      get: (key: string, fallback: unknown) => config[key] ?? fallback,
    } as unknown as ConfigService;
    return new RequestIdMiddleware(configService);
  }

  it('assigns a request id and continues without logging by default', () => {
    const request = createRequest();
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;

    middleware({}).use(request, response, next);

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', request.requestId);
    expect(next).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs the forwarded chain when DEBUG_FORWARDED is enabled', () => {
    const request = createRequest({
      'x-real-ip': '198.51.100.20',
      'x-forwarded-for': '198.51.100.20, 100.64.0.7',
    });

    middleware({ DEBUG_FORWARDED: 'true' }).use(
      request,
      createResponse(),
      next,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(warn.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(entry).toMatchObject({
      event: 'FORWARDED_DEBUG',
      requestId: request.requestId,
      remoteAddress: '100.64.0.9',
      ip: '198.51.100.20',
      xRealIp: '198.51.100.20',
      xForwardedFor: '198.51.100.20, 100.64.0.7',
    });
  });

  it('stays silent when DEBUG_FORWARDED is disabled', () => {
    middleware({ DEBUG_FORWARDED: 'false' }).use(
      createRequest(),
      createResponse(),
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
