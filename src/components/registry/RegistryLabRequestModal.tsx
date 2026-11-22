import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Radiation, Send, X } from 'lucide-react';
import {
  NdtLabControlStage,
  NdtLabRequest,
  NdtMethod,
  WeldJoint,
} from '../../types/welding';
import {
  getActiveLabRequestForJoint,
  getJointLabRequestStatus,
  suggestNextLabRequestNumber,
  validateJointForLabRequestSubmission,
} from '../../utils/laboratoryLogic';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { RegistryLabRequestModalProps } from './types';

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
  const [labReqDate, setLabReqDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [labReqMethod, setLabReqMethod] = useState<NdtMethod>('РК');
  const [labReqStage, setLabReqStage] =
    useState<NdtLabControlStage>('Первичный ВИК и НК');
  const [labReqNotes, setLabReqNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const candidateEvaluation = useMemo(() => {
    const targetSet = new Set(candidateJointIds);
    const candidates = joints.filter((j) => targetSet.has(j.id));
    const eligible: WeldJoint[] = [];
    const rejected: Array<{ joint: WeldJoint; reasons: string[] }> = [];

    for (const j of candidates) {
      const actReq = getActiveLabRequestForJoint(j.id, labRequests, labReqMethod);
      const val = validateJointForLabRequestSubmission(j, welders);
      const reasons = [...val.reasons];
      if (actReq) {
        reasons.push(
          `Стык уже включен в активную заявку №${actReq.requestNumber} (${actReq.status}) на метод ${actReq.requestedMethod}`
        );
      } else {
        const status = getJointLabRequestStatus(j, labRequests);
        if (status === 'Заявка подана' || status === 'Заявка в работе') {
          reasons.push(`По стыку уже числится статус «${status}»`);
        }
      }
      if (reasons.length === 0) {
        eligible.push(j);
      } else {
        rejected.push({ joint: j, reasons });
      }
    }
    return { eligible, rejected };
  }, [joints, candidateJointIds, labRequests, welders]);

  if (!isOpen) return null;

  const handleConfirmSubmit = async () => {
    if (candidateEvaluation.eligible.length === 0 || isSubmitting) return;

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
          requestedMethod: labReqMethod,
          controlStage: labReqStage,
          jointIds: lineJoints.map((j) => j.id),
          status: 'Подана ПТО',
          notes:
            labReqNotes.trim() ||
            `Заявка направлена из реестра стыков (${lineJoints.length} ст., дата сварки и клеймо НАКС проверены без замечаний)`,
        };
        const ok = await Promise.resolve(onCreateLabRequest(newReq));
        if (ok === false) {
          setSubmitError('Сервер отклонил сохранение заявки на НК. Проверьте права доступа и подключение.');
          setIsSubmitting(false);
          return;
        }
      }

      onClose();
      onSuccess(
        `Заявка в Лабораторию НК (${createdNumbers.join(', ')}) успешно направлена для ${
          candidateEvaluation.eligible.length
        } ст. Статус в реестре обновлён на «Заявка подана».`
      );
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Ошибка передачи заявки на сервер');
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
                Оформление задания на неразрушающий контроль от инженера ПТО
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Требуемый метод контроля
              </label>
              <select
                value={labReqMethod}
                onChange={(e) => setLabReqMethod(e.target.value as NdtMethod)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-[#1e3799] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
              >
                <option value="РК">РК (Радиографический контроль)</option>
                <option value="УЗК">УЗК (Ультразвуковой контроль)</option>
                <option value="ПВК">ПВК (Капиллярный контроль)</option>
                <option value="МПК">МПК (Магнитопорошковый контроль)</option>
              </select>
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
                <option value="Выборочный дублирующий контроль">
                  Выборочный дублирующий контроль
                </option>
                <option value="Контроль после ремонта (1-й ремонт)">
                  Контроль после ремонта (1-й ремонт)
                </option>
                <option value="Контроль после повторного ремонта">
                  Контроль после повторного ремонта
                </option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Допущены к подаче заявки ({candidateEvaluation.eligible.length} ст.):
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
                      <span className="text-slate-500">({j.uniqueLineId})</span>
                      <span className="text-emerald-700">
                        [{formatDateDDMMYY(j.weldingDate)} · кл. {j.welderStamp}]
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800">
                  Нет стыков, прошедших проверку заполнения даты сварки и аттестации клейма сварщика НАКС.
                </p>
              )}
            </div>

            {candidateEvaluation.rejected.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Отклонены автоматическим входным контролем ({candidateEvaluation.rejected.length} ст.):
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
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={candidateEvaluation.eligible.length === 0 || isSubmitting}
              onClick={handleConfirmSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:bg-slate-300 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-pulse' : ''}`} />
              <span>
                {isSubmitting
                  ? 'Сохранение...'
                  : `Направить заявку (${candidateEvaluation.eligible.length} ст.)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
