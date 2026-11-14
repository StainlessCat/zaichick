import { WelderProfile } from '../types/welding';

export interface WelderCertMethodInfo {
  certNumber: string;
  issueDate?: string;
  expiryDate?: string;
  admissionSheetNumber?: string;
  admissionSheetDate?: string;
}

/**
 * Нормализует строку клейма сварщика или бригады:
 * приводит к верхнему регистру и заменяет латинские буквы-двойники на кириллические (A->А, K->К, M->М, T->Т, P->Р и т.д.),
 * чтобы ввод с любой раскладки клавиатуры находил нужное клеймо.
 */
export function normalizeStampString(raw?: string | null): string {
  if (!raw) return '';
  const upper = String(raw).trim().toUpperCase();
  const latinToCyrillic: Record<string, string> = {
    A: 'А',
    B: 'В',
    C: 'С',
    E: 'Е',
    H: 'Н',
    K: 'К',
    M: 'М',
    O: 'О',
    P: 'Р',
    T: 'Т',
    X: 'Х',
    Y: 'У',
  };
  return upper
    .split('')
    .map((ch) => latinToCyrillic[ch] || ch)
    .join('');
}

/**
 * Находит профиль сварщика или бригады по номеру клейма (независимо от регистра и раскладки).
 */
export function findWelderByStamp(
  weldersDirectory: WelderProfile[],
  rawStamp?: string | null,
  brigadeFilter?: boolean
): WelderProfile | undefined {
  const norm = normalizeStampString(rawStamp);
  if (!norm) return undefined;
  return weldersDirectory.find((w) => {
    if (brigadeFilter === true && !w.isBrigade) return false;
    if (brigadeFilter === false && w.isBrigade) return false;
    return normalizeStampString(w.stamp) === norm;
  });
}

/**
 * Живой поиск сварщиков или бригад во время ввода номера клейма (с приоритетом совпадения по клейму, а также по ФИО и № удостоверения).
 */
export function searchWeldersByStampOrName(
  welders: WelderProfile[],
  query: string,
  excludeStamps: string[] = []
): WelderProfile[] {
  const excludedNorm = new Set(
    excludeStamps.map((s) => normalizeStampString(s)).filter(Boolean)
  );
  const baseList = welders.filter(
    (w) => !excludedNorm.has(normalizeStampString(w.stamp))
  );

  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return baseList;

  const normQuery = normalizeStampString(cleanQuery);
  const lowerQuery = cleanQuery.toLowerCase();

  const matched = baseList.filter((w) => {
    const normStamp = normalizeStampString(w.stamp);
    if (normStamp.includes(normQuery)) return true;
    if (w.stamp.toLowerCase().includes(lowerQuery)) return true;
    if (w.fullName.toLowerCase().includes(lowerQuery)) return true;
    if (w.certNumber.toLowerCase().includes(lowerQuery)) return true;
    if (
      w.brigadeMembers &&
      w.brigadeMembers.some(
        (m) =>
          normalizeStampString(m).includes(normQuery) ||
          m.toLowerCase().includes(lowerQuery)
      )
    ) {
      return true;
    }
    return false;
  });

  return matched.sort((a, b) => {
    const aNorm = normalizeStampString(a.stamp);
    const bNorm = normalizeStampString(b.stamp);

    const aExact = aNorm === normQuery ? 0 : 1;
    const bExact = bNorm === normQuery ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    const aStarts = aNorm.startsWith(normQuery) ? 0 : 1;
    const bStarts = bNorm.startsWith(normQuery) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    const aInStamp = aNorm.includes(normQuery) ? 0 : 1;
    const bInStamp = bNorm.includes(normQuery) ? 0 : 1;
    if (aInStamp !== bInStamp) return aInStamp - bInStamp;

    return a.stamp.localeCompare(b.stamp, 'ru');
  });
}

/**
 * Получает реквизиты удостоверения НАКС сварщика для конкретного способа сварки (РАД, РД, МП, АФ).
 * На разные области аттестации сварщик получает отдельные удостоверения НАКС.
 */
export function getWelderCertForMethod(
  welder: WelderProfile,
  weldingType?: string
): WelderCertMethodInfo {
  const method = (weldingType || '').trim();

  if (welder.naksCerts && welder.naksCerts.length > 0) {
    if (method) {
      // 1. Прямое совпадение способа сварки
      const exact = welder.naksCerts.find(
        (c) => c.weldingType.toLowerCase() === method.toLowerCase()
      );
      if (exact && exact.certNumber) {
        return {
          certNumber: exact.certNumber,
          issueDate: exact.issueDate || welder.certIssueDate,
          expiryDate: exact.expiryDate || welder.certExpiryDate,
          admissionSheetNumber: exact.admissionSheetNumber || welder.admissionSheetNumber,
          admissionSheetDate: exact.admissionSheetDate || welder.admissionSheetDate,
        };
      }

      // 2. Если комбинированный способ (РАД+РД), а у сварщика отдельные удостоверения на РАД и РД
      if (method.includes('+')) {
        const parts = method.split('+').map((p) => p.trim().toLowerCase());
        const matched = welder.naksCerts.filter((c) =>
          parts.includes(c.weldingType.toLowerCase())
        );
        if (matched.length > 0) {
          return {
            certNumber: matched.map((m) => `${m.weldingType}: ${m.certNumber}`).join('; '),
            issueDate: matched[0].issueDate || welder.certIssueDate,
            expiryDate: matched[0].expiryDate || welder.certExpiryDate,
            admissionSheetNumber:
              matched.map((m) => m.admissionSheetNumber).filter(Boolean).join('; ') ||
              welder.admissionSheetNumber,
            admissionSheetDate: matched[0].admissionSheetDate || welder.admissionSheetDate,
          };
        }
      }
    }

    // 3. Если способ не совпал или не передан, берем первое удостоверение из списка
    const first = welder.naksCerts[0];
    if (first && first.certNumber) {
      return {
        certNumber: first.certNumber,
        issueDate: first.issueDate || welder.certIssueDate,
        expiryDate: first.expiryDate || welder.certExpiryDate,
        admissionSheetNumber: first.admissionSheetNumber || welder.admissionSheetNumber,
        admissionSheetDate: first.admissionSheetDate || welder.admissionSheetDate,
      };
    }
  }

  // Fallback: основное удостоверение профиля
  return {
    certNumber: welder.certNumber || '',
    issueDate: welder.certIssueDate,
    expiryDate: welder.certExpiryDate,
    admissionSheetNumber: welder.admissionSheetNumber,
    admissionSheetDate: welder.admissionSheetDate,
  };
}
