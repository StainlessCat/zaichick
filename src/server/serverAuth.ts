/**
 * ZAYCHICK — Серверный модуль криптографической безопасности и аутентификации (Node.js).
 * Использует нативный криптографический модуль node:crypto, сертифицированный NIST,
 * аппаратное ускорение и timingSafeEqual для предотвращения timing-атак при проверке паролей.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { UserAccount } from '../types/welding';
import type { AuthenticatedSession } from '../utils/authSecurity';
export type { AuthenticatedSession };

/**
 * Генерирует криптографически стойкую соль заданной длины в байтах.
 */
export function generateSecureSalt(byteLength = 16): string {
  return randomBytes(byteLength).toString('hex');
}

/**
 * Хеширует пароль с криптографической солью через нативный SHA-256 (node:crypto).
 * Каскадные раунды хеширования защищают от радужных таблиц (rainbow tables).
 */
export function hashPasswordWithSalt(
  password: string,
  salt?: string,
  rounds = 100
): { hash: string; salt: string } {
  const finalSalt = salt || generateSecureSalt(16);
  let current = `${finalSalt}:${password}:${finalSalt}`;
  for (let r = 0; r < rounds; r++) {
    current = createHash('sha256').update(current, 'utf8').digest('hex');
  }
  return { hash: current, salt: finalSalt };
}

/**
 * Безопасное по времени (constant-time) сравнение двух строк.
 * Предотвращает timing-атаки по времени ответа сервера.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Выполняем фиктивное сравнение равной длины для сглаживания времени
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Проверяет подлинность пароля пользователя на сервере.
 * Поддерживает обратную совместимость с тестовыми паролями ('123')
 * и безопасную сверку хешей через timingSafeEqual.
 */
export function verifyPassword(
  inputPassword: string,
  storedPasswordOrHash: string,
  salt?: string
): boolean {
  if (!inputPassword || !storedPasswordOrHash) return false;

  // 1. Если передана соль — производим криптографическую сверку соленого хеша
  if (salt) {
    const computed = hashPasswordWithSalt(inputPassword, salt);
    return timingSafeCompare(computed.hash, storedPasswordOrHash);
  }

  // 2. Обратная совместимость с открытыми паролями (сидовые аккаунты '123')
  if (timingSafeCompare(inputPassword, storedPasswordOrHash)) {
    return true;
  }

  // 3. Проверка прямого sha256 без соли
  const directHash = createHash('sha256').update(inputPassword, 'utf8').digest('hex');
  if (timingSafeCompare(directHash, storedPasswordOrHash)) {
    return true;
  }

  return false;
}

/**
 * Генерирует уникальный криптостойкий токен сессии (zsess_...)
 */
export function generateSessionToken(): string {
  const randBytes = randomBytes(24).toString('hex');
  const timestamp = Date.now().toString(36);
  return `zsess_${timestamp}_${randBytes}`;
}

/**
 * Создает объект сессии с заданным временем жизни (по умолчанию 24 часа)
 */
export function createAuthenticatedSession(
  user: UserAccount,
  lifetimeHours = 24
): AuthenticatedSession {
  const now = new Date();
  const expires = new Date(now.getTime() + lifetimeHours * 3600 * 1000);
  return {
    token: generateSessionToken(),
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    isAdmin: Boolean(user.isAdmin),
    department: user.department || '',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

/**
 * Проверяет, активна ли сессия (не истекло ли время жизни)
 */
export function isSessionActive(session: AuthenticatedSession): boolean {
  if (!session || !session.expiresAt) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}
