import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiRequest,
  parseRetryAfterHeader,
  registerUnauthorizedHandler,
} from '../api/client';

describe('Auth & Session API Client Safeguards', () => {
  afterEach(() => {
    registerUnauthorizedHandler(null);
    vi.restoreAllMocks();
  });

  it('parses Retry-After numeric seconds and HTTP date headers accurately', () => {
    expect(parseRetryAfterHeader('45')).toBe(45);
    expect(parseRetryAfterHeader(' 120 ')).toBe(120);
    expect(parseRetryAfterHeader('0')).toBeUndefined();
    expect(parseRetryAfterHeader('-10')).toBeUndefined();
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader('not-a-date')).toBeUndefined();

    const futureDate = new Date(Date.now() + 30_000).toUTCString();
    const parsedFuture = parseRetryAfterHeader(futureDate);
    expect(parsedFuture).toBeGreaterThanOrEqual(25);
    expect(parsedFuture).toBeLessThanOrEqual(35);
  });

  it('attaches X-Requested-With header and credentials: include on API requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const data = await apiRequest<{ status: string }>('/api/health');
    expect(data.status).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.credentials).toBe('include');
    const headers = init?.headers as Headers;
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it('exposes retryAfterSeconds on ApiError when server responds with 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Слишком много попыток' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '90',
        },
      })
    );

    await expect(
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: 'admin', password: 'wrong' }),
      })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      retryAfterSeconds: 90,
      message: 'Слишком много попыток',
    });
  });

  it('notifies global unauthorized handler on 401 from protected endpoints but skips auth login/session probes', async () => {
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Требуется авторизация.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Неверный логин или пароль.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Сессия завершена.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    await expect(apiRequest('/api/auth/session')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/api/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();

    await expect(apiRequest('/api/joints')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({
      url: '/api/joints',
      status: 401,
      message: 'Сессия завершена.',
    });
  });
});
