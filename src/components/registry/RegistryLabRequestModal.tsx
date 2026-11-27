import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Radiation, Send, X } from 'lucide-react';
import {
  LabConclusionMethodKey,
  NdtLabControlStage,
  NdtLabRequest,
  NdtMethod,
  WeldJoint,
} from '../../types/welding';
import {
  CANONICAL_LAB_METHODS,
  getRequestMethodsList,
  resolveLineLabMethodAvailability,
  suggestNextLabRequestNumber,
  validateJointForLabRequestSubmission,
} from '../../utils/laboratoryLogic';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { RegistryLabRequestModalProps } from './types';

const METHOD_FULL_LABELS: Record<LabConclusionMethodKey, string> = {
  ВИК: 'Визуальный и измерительный',
  РК: 'Радиографический',
  УЗК: 'Ультразвуковой',
  ПВК: 'Капиллярный',
};

function derivePrimaryRequestedMethod(methods: LabConclusionMethodKey[]): NdtMethod {
  const hasRk = methods.includes('РК');
  const hasUzk = methods.includes('УЗК');
  const hasPvk = methods.includes('ПВК');
  if (hasRk && hasUzk) return 'РК+УЗК';
  if (hasRk) return 'РК';
  if (hasUzk) return 'УЗК';
  if (hasPvk) return 'ПВК';
  return 'Не требуется';
}

export const RegistryLabRequestModal: React.FC<RegistryLabRequestModalProps> = ({
  isOpen,
  onClose,
  candidateJointIds,
  joints,
  lines,
  welders,
  labRequests,
  currentUserFullName,
  onCreateLabRequest,
  onSuccess,
}) => {
  const [labReqNumber, setLabReqNumber] = useState(() =>
    suggestNextLabRequestNumber(labRequests)
  );
  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty: false,
    onClose,
  });
  const [labReqDate, setLabReqDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [selectedMethods, setSelectedMethods] = useState<LabConclusionMethodKey[]>([
    'ВИК',
    'РК',
  ]);
  const [labReqStage, setLabReqStage] =
    useState<NdtLabControlStage>('Первичный ВИК и НК');
  const [labReqNotes, setLabReqNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const candidateJoints = useMemo(() => {
    const targetSet = new Set(candidateJointIds);
    return joints.filter((j) => targetSet.has(j.id));
  }, [joints, candidateJointIds]);

  // Определяем сводную доступность методов по нормам Лайнлиста для всех линий кандидатов
  const lineNormsSummary = useMemo(() => {
    const lineIds = Array.from(
      new Set(candidateJoints.map((j) => j.uniqueLineId).filter(Boolean))
    );
    const matchedLines = lineIds
      .map((id) => lines.find((l) => l.uniqueLineId === id) || null);

    if (matchedLines.length === 0) {
      return resolveLineLabMethodAvailability(null);
    }

    const evaluations = matchedLines.map((line) =>
      resolveLineLabMethodAvailability(line)
    );
    const allHaveNorms = evaluations.every((ev) => ev.hasLineNorms);
    const methods = {} as ReturnType<typeof resolveLineLabMethodAvailability>['methods'];

    for (const m of CANONICAL_LAB_METHODS) {
      const maxPct = Math.max(...evaluations.map((ev) => ev.methods[m].planPct));
      const anyRequired = evaluations.some((ev) => ev.methods[m].required);
      const allDisabled = allHaveNorms && evaluations.every((ev) => ev.methods[m].disabled);
      methods[m] = {
        method: m,
        planPct: maxPct,
        required: anyRequired,
        disabled: allDisabled,
      };
    }

    const requiredMethods = CANONICAL_LAB_METHODS.filter((m) => methods[m].required);
    return {
      hasLineNorms: allHaveNorms,
      warningMessage: allHaveNorms
        ? undefined
        : evaluations.find((ev) => ev.warningMessage)?.warningMessage,
      methods,
      requiredMethods:
        requiredMethods.length > 0 ? requiredMethods : (['ВИК', 'РК'] as LabConclusionMethodKey[]),
    };
  }, [candidateJoints, lines]);

  // Обновляем номер заявки, дату и список методов при каждом открытии модального окна
  useEffect(() => {
    if (!isOpen) return;
    setLabReqNumber(suggestNextLabRequestNumber(labRequests));
    setLabReqDate(new Date().toISOString().slice(0, 10));
    setSubmitError(null);
    setLabReqNotes('');
    setSelectedMethods(
      lineNormsSummary.requiredMethods.length > 0
        ? [...lineNormsSummary.requiredMethods]
        : ['ВИК', 'РК']
    );
  }, [isOpen, candidateJointIds]);

  const toggleMethod = (method: LabConclusionMethodKey) => {
    if (lineNormsSummary.methods[method]?.disabled) return;
    setSelectedMethods((prev) => {
      if (prev.includes(method)) {
        if (prev.length <= 1) return prev;
        return prev.filter((m) => m !== method);
      }
      return CANONICAL_LAB_METHODS.filter(
        (m) => m === method || prev.includes(m)
      );
    });
  };

  const candidateEvaluation = useMemo(() => {
    const eligible: WeldJoint[] = [];
    const rejected: Array<{ joint: WeldJoint; reasons: string[] }> = [];

    for (const j of candidateJoints) {
      const val = validateJointForLabRequestSubmission(j, welders);
      const reasons = [...val.reasons];

      const activeReqsForJoint = labRequests.filter(
        (r) =>
          (r.status === 'Подана ПТО' || r.status === 'В работе ЛНК') &&
          r.jointIds.includes(j.id)
      );

      for (const actReq of activeReqsForJoint) {
        const reqMethods = getRequestMethodsList(actReq);
        const overlapping = selectedMethods.filter((m) => reqMethods.includes(m));
        if (overlapping.length > 0) {
          reasons.push(
            `Стык уже включён в активную заявку №${actReq.requestNumber} · ${actReq.status} по методам ${overlapping.join(', ')}`
          );
          break;
        }
      }

      if (reasons.length === 0) {
        eligible.push(j);
      } else {
        rejected.push({ joint: j, reasons });
      }
    }
    return { eligible, rejected };
  }, [candidateJoints, labRequests, welders, selectedMethods]);

  if (!isOpen) return null;

  const primaryMethod = derivePrimaryRequestedMethod(selectedMethods);

  const handleConfirmSubmit = async () => {
    if (
      candidateEvaluation.eligible.length === 0 ||
      selectedMethods.length === 0 ||
      isSubmitting
    ) {
      return;
    }

    // Группируем допущенные стыки по линиям, чтобы создать корректные заявки по каждой линии
    const byLine = new Map<string, WeldJoint[]>();
    for (const j of candidateEvaluation.eligible) {
      const list = byLine.get(j.uniqueLineId) || [];
      list.push(j);
      byLine.set(j.uniqueLineId, list);
    }

    setIsSubmitting(true);
    setSubmitError(null);

    let indexOffset = 0;
    const createdNumbers: string[] = [];
    try {
      for (const [uLineId, lineJoints] of byLine.entries()) {
        const sample = lineJoints[0];
        const matchedLine = lines.find((l) => l.uniqueLineId === uLineId);
        const lineEval = resolveLineLabMethodAvailability(matchedLine);
        const lineEffectiveMethods = lineEval.hasLineNorms
          ? selectedMethods.filter((m) => !lineEval.methods[m].disabled)
          : selectedMethods;
        const methodsForReq =
          lineEffectiveMethods.length > 0 ? lineEffectiveMethods : selectedMethods;

        const reqNum =
          byLine.size === 1
            ? labReqNumber.trim() || suggestNextLabRequestNumber(labRequests)
            : `${
                labReqNumber.trim() || suggestNextLabRequestNumber(labRequests)
              }/${indexOffset + 1}`;
        indexOffset += 1;
        createdNumbers.push(reqNum);

        const newReq: NdtLabRequest = {
          id: `lab-req-${Date.now()}-${indexOffset}`,
          requestNumber: reqNum,
          createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          createdDate: labReqDate || new Date().toISOString().slice(0, 10),
          createdBy: currentUserFullName,
          objectName: sample.objectName,
          rdCode: sample.rdCode,
          lineNumber: sample.lineNumber,
          uniqueLineId: uLineId,
          contour: sample.contour || matchedLine?.testContour || '',
          requestedMethod: derivePrimaryRequestedMethod(methodsForReq),
          requestedMethods: methodsForReq,
          controlStage: labReqStage,
          jointIds: lineJoints.map((j) => j.id),
          status: 'Подана ПТО',
          notes:
            labReqNotes.trim() ||
            `Заявка направлена из реестра стыков · ${lineJoints.length} ст., методы: ${methodsForReq.join(', ')}`,
        };
        const ok = await Promise.resolve(onCreateLabRequest(newReq));
        if (ok === false) {
          setSubmitError(
            'Сервер отклонил сохранение заявки на НК. Проверьте права доступа и подключение.'
          );
          setIsSubmitting(false);
          return;
        }
      }

      onClose();
      onSuccess(
        `Заявка в Лабораторию НК ${createdNumbers.join(', ')} успешно направлена для ${
          candidateEvaluation.eligible.length
        } ст. · методы: ${selectedMethods.join(', ')}.`
      );
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Ошибка передачи заявки на сервер'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs no-print">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 bg-gradient-to-r from-[#1e3799] to-[#15276e] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Radiation className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold leading-tight">
                Направление заявки в Лабораторию НК
              </h3>
              <p className="text-[11px] text-sky-200">
                Оформление единого пакетного задания на неразрушающий контроль
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть окно"
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Номер заявки
              </label>
              <input
                type="text"
                value={labReqNumber}
                onChange={(e) => setLabReqNumber(e.target.value)}
                placeholder="ЗНК-..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Дата подачи заявки
              </label>
              <input
                type="date"
                value={labReqDate}
                onChange={(e) => setLabReqDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-[11px] font-bold text-slate-700">
                Методы контроля по нормам линии
              </label>
              <span className="text-[11px] font-mono text-slate-500">
                Основной метод: <strong className="text-[#1e3799]">{primaryMethod}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CANONICAL_LAB_METHODS.map((method) => {
                const info = lineNormsSummary.methods[method];
                const isChecked = selectedMethods.includes(method);
                const isDisabled = Boolean(info?.disabled);
                return (
                  <label
                    key={method}
                    title={
                      isDisabled
                        ? `Метод ${method} не предусмотрен нормами Лайнлиста`
                        : `${method} — ${METHOD_FULL_LABELS[method]}`
                    }
                    className={`flex flex-col gap-0.5 px-2.5 py-2 rounded-lg border transition-colors ${
                      isDisabled
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-65'
                        : isChecked
                        ? 'bg-[#e8f1fc] border-[#1e3799] text-[#1e3799] cursor-pointer'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 font-bold text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleMethod(method)}
                          className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                        />
                        <span>{method}</span>
                      </span>
                      {info && info.planPct > 0 && (
                        <span className="text-[10px] font-mono tabular-nums font-semibold">
                          {info.planPct}%
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 truncate">
                      {METHOD_FULL_LABELS[method]}
                    </span>
                  </label>
                );
              })}
            </div>

            {lineNormsSummary.warningMessage && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{lineNormsSummary.warningMessage}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Стадия контроля
            </label>
            <select
              value={labReqStage}
              onChange={(e) =>
                setLabReqStage(e.target.value as NdtLabControlStage)
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
            >
              <option value="Первичный ВИК и НК">Первичный ВИК и НК</option>
              <option value="Физический НК (РК/УЗК/ПВК)">Физический НК</option>
              <option value="Повторный НК после ремонта">
                Повторный НК после ремонта
              </option>
              <option value="Дублирующий контроль">Дублирующий контроль</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Допущены к подаче заявки · {candidateEvaluation.eligible.length} ст.
                </span>
              </div>
              {candidateEvaluation.eligible.length > 0 ? (
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {candidateEvaluation.eligible.map((j) => (
                    <span
                      key={j.id}
                      className="inline-flex items-center gap-1 mr-1.5 mb-1 px-2 py-0.5 rounded bg-white border border-emerald-300 text-[11px] font-mono text-slate-900"
                    >
                      <strong>№ {j.jointNumber}</strong>
                      <span className="text-slate-500">· {j.uniqueLineId}</span>
                      <span className="text-emerald-700">
                        [{formatDateDDMMYY(j.weldingDate)} · кл. {j.welderStamp}]
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800">
                  Нет стыков, прошедших проверку заполнения даты сварки, аттестации клейма сварщика НАКС и отсутствия дублирующих активных заявок.
                </p>
              )}
            </div>

            {candidateEvaluation.rejected.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Отклонены автоматическим входным контролем · {candidateEvaluation.rejected.length} ст.
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {candidateEvaluation.rejected.map(({ joint, reasons }) => (
                    <div
                      key={joint.id}
                      className="p-2 rounded bg-white border border-rose-200 text-[11px] flex flex-col gap-0.5"
                    >
                      <div className="font-mono font-bold text-slate-900">
                        Стык № {joint.jointNumber} · Линия {joint.uniqueLineId}
                      </div>
                      <div className="text-rose-700 font-medium">
                        {reasons.join(' • ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Примечание для дефектоскопистов ЛНК
            </label>
            <input
              type="text"
              value={labReqNotes}
              onChange={(e) => setLabReqNotes(e.target.value)}
              placeholder="Например: Участок доступен для РК в ночную смену..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
            />
          </div>

          {submitError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Отправитель ПТО: <strong className="text-slate-800">{currentUserFullName}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={
                candidateEvaluation.eligible.length === 0 ||
                selectedMethods.length === 0 ||
                isSubmitting
              }
              onClick={handleConfirmSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:bg-slate-300 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-pulse' : ''}`} />
              <span>
                {isSubmitting
                  ? 'Сохранение...'
                  : `Направить заявку · ${candidateEvaluation.eligible.length} ст.`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
