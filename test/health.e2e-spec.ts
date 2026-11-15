import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttp } from '../src/config/http.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

describe('Deployment health endpoint', () => {
  let app: NestExpressApplication;
  const database = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn(), evaluate: jest.fn() };

  beforeAll(async () => {
    const config = new ConfigService({
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: 900,
      TRUST_PROXY: 'false',
      RATE_LIMIT_STORAGE: 'redis',
      RATE_LIMIT_PREFIX: 'e2e:health',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, config);
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    database.$queryRaw.mockResolvedValue([{ result: 1 }]);
    redis.ping.mockResolvedValue(true);
    redis.evaluate.mockRejectedValue(new Error('Rate limit Redis unavailable'));
  });

  afterAll(async () => app?.close());

  it('serves public /health without depending on the Redis rate-limit counter', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toMatchObject({
      data: { status: 'ok', checks: { database: 'up', redis: 'up' } },
    });
    expect(redis.evaluate).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/api/v1/health').expect(404);
  });

  it('reports database failure with 503 without exposing the underlying error', async () => {
    database.$queryRaw.mockRejectedValue(
      new Error('private database credentials'),
    );
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect(response.body).toMatchObject({
      data: { status: 'degraded', checks: { database: 'down', redis: 'up' } },
    });
    expect(response.text).not.toContain('private database credentials');
  });

  it('reports Redis failure with 503 while the rate-limit store is unavailable', async () => {
    redis.ping.mockResolvedValue(false);
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect(response.body).toMatchObject({
      data: { status: 'degraded', checks: { database: 'up', redis: 'down' } },
    });
    expect(redis.evaluate).not.toHaveBeenCalled();
  });
});
