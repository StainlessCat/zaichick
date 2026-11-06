/**
 * ZAYCHICK — Модуль криптографической безопасности, хеширования паролей и управления сессиями.
 * Обеспечивает защиту от атак по подбору паролей (соление, итерации SHA-256),
 * криптостойкие токены авторизации и серверную верификацию RBAC.
 */

import { UserAccount } from '../types/welding';

// Вспомогательные функции для вычисления SHA-256 (чистая реализация без внешних зависимостей)
function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

export function sha256(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  // Инициализация хеш-констант (первые 32 бита дробных частей квадратных корней первых 8 простых чисел)
  let hash: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  // Константы раундов (первые 32 бита дробных частей кубических корней первых 64 простых чисел)
  const k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Преобразование ASCII строки в массив 32-битных слов
  for (i = 0; i < ascii[lengthProperty]; i++) {
    const code = ascii.charCodeAt(i);
    words[i >> 2] |= code << ((3 - (i % 4)) * 8);
  }

  // Добавление бита '1' в конец сообщения
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  // Длина исходного сообщения в битах (64 бита)
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w: number[] = new Array(64);

  // Обработка каждого 512-битного блока
  for (i = 0; i < words.length; i += 16) {
    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const temp1 = (h + sigma1 + ch + k[j] + w[j]) | 0;
      const temp2 = (sigma0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  // Конвертация в шестнадцатеричную строку
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

/**
 * Генерирует случайную криптографическую соль заданной длины
 */
export function generateSalt(byteLength = 16): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Запасной псевдослучайный генератор
  let salt = '';
  for (let i = 0; i < byteLength * 2; i++) {
    salt += Math.floor(Math.random() * 16).toString(16);
  }
  return salt;
}

/**
 * Хеширует пароль с добавлением криптографической соли.
 * Выполняет каскадные раунды SHA-256 для защиты от радужных таблиц (rainbow tables).
 */
export function hashPasswordWithSalt(
  password: string,
  salt?: string,
  rounds = 100
): { hash: string; salt: string } {
  const finalSalt = salt || generateSalt(16);
  let current = `${finalSalt}:${password}:${finalSalt}`;
  for (let r = 0; r < rounds; r++) {
    current = sha256(current);
  }
  return { hash: current, salt: finalSalt };
}

/**
 * Безопасное по времени (constant-time) сравнение двух строк.
 * Предотвращает timing-атаки по времени сверки хешей или паролей.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

/**
 * Проверяет подлинность пароля пользователя.
 * Поддерживает обратную совместимость с исходными тестовыми паролями ('123')
 * и автоматически валидирует соленый хеш при его наличии с защитой от timing-атак.
 */
export function verifyPassword(
  inputPassword: string,
  storedPasswordOrHash: string,
  salt?: string
): boolean {
  if (!inputPassword || !storedPasswordOrHash) return false;

  // 1. Если передана соль — производим криптографическую сверку хешей
  if (salt) {
    const computed = hashPasswordWithSalt(inputPassword, salt);
    return timingSafeEqualString(computed.hash, storedPasswordOrHash);
  }

  // 2. Обратная совместимость с открытыми паролями (сидовые аккаунты '123')
  if (timingSafeEqualString(inputPassword, storedPasswordOrHash)) {
    return true;
  }

  // 3. Проверка прямого sha256 без соли
  if (timingSafeEqualString(sha256(inputPassword), storedPasswordOrHash)) {
    return true;
  }

  return false;
}

/**
 * Генерирует уникальный криптостойкий токен сессии (zsess_...)
 */
export function generateSessionToken(): string {
  const randBytes = generateSalt(24);
  const timestamp = Date.now().toString(36);
  return `zsess_${timestamp}_${randBytes}`;
}

export interface AuthenticatedSession {
  token: string;
  login: string;
  fullName: string;
  role: string;
  isAdmin: boolean;
  department: string;
  createdAt: string;
  expiresAt: string;
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
