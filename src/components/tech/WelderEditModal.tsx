import React from 'react';
import { Award, Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { WelderNaksCert, WelderProfile, WeldingType } from '../../types/welding';
import { checkNaksCertStatus, formatDateDDMMYY } from '../../utils/weldingLogic';

export interface WelderEditModalProps {
  welderModal: {
    isOpen: boolean;
    isBrigade: boolean;
    item: WelderProfile | null;
  };
  setWelderModal: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      isBrigade: boolean;
      item: WelderProfile | null;
    }>
  >;
  welderForm: WelderProfile;
  setWelderForm: React.Dispatch<React.SetStateAction<WelderProfile>>;
  personalWelders: WelderProfile[];
  existingForemen: string[];
  customSteelGroup: string;
  setCustomSteelGroup: React.Dispatch<React.SetStateAction<string>>;
  modalError: string;
  setModalError: React.Dispatch<React.SetStateAction<string>>;
  isSaving: boolean;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  confirmModalDelete: boolean;
  setConfirmModalDelete: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onToggleBrigadeMember: (stamp: string) => void;
  onToggleAllowedMethod: (method: WeldingType) => void;
  onToggleSteelGroup: (group: string) => void;
  onAddCustomSteelGroup: () => void;
  onAddNaksCert: () => void;
  onUpdateNaksCert: (index: number, patch: Partial<WelderNaksCert>) => void;
  onRemoveNaksCert: (index: number) => void;
  onDeleteWelder?: (stamp: string) => Promise<{ ok: boolean; error?: string } | void> | void;
  allWeldingMethods: WeldingType[];
  standardSteelGroups: string[];
}

export const WelderEditModal: React.FC<WelderEditModalProps> = ({
  welderModal,
  setWelderModal,
  welderForm,
  setWelderForm,
  personalWelders,
  existingForemen,
  customSteelGroup,
  setCustomSteelGroup,
  modalError,
  setModalError,
  isSaving,
  setIsSaving,
  confirmModalDelete,
  setConfirmModalDelete,
  onClose: closeWelderModal,
  onSubmit: handleWelderSubmit,
  onToggleBrigadeMember: toggleBrigadeMemberInForm,
  onToggleAllowedMethod: toggleAllowedMethod,
  onToggleSteelGroup: toggleSteelGroup,
  onAddCustomSteelGroup: handleAddCustomSteelGroup,
  onAddNaksCert: handleAddNaksCert,
  onUpdateNaksCert: updateNaksCert,
  onRemoveNaksCert: removeNaksCert,
  onDeleteWelder,
  allWeldingMethods: ALL_WELDING_METHODS,
  standardSteelGroups: STANDARD_STEEL_GROUPS,
}) => {
  if (!welderModal.isOpen) return null;

  return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Данные сварщика или бригадного клейма"
  >
    <div
      className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
      onClick={closeWelderModal}
    />
    <div className="relative z-10 w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
        <div className="flex items-center gap-2.5">
          <Award className="w-5 h-5 text-sky-300" />
          <h2 className="text-sm font-bold">
            {welderModal.isBrigade
              ? welderModal.item
                ? `Редактирование бригадного клейма ${welderModal.item.stamp}`
                : 'Новое бригадное клеймо'
              : welderModal.item
                ? `Карточка сварщика ${welderModal.item.stamp}`
                : 'Новый аттестованный сварщик НАКС'}
          </h2>
        </div>
        <button
          type="button"
          onClick={closeWelderModal}
          disabled={isSaving}
          className="p-1 rounded text-sky-100 hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form
        onSubmit={handleWelderSubmit}
        className="p-6 space-y-4 text-xs overflow-y-auto flex-1"
      >
        {modalError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
            {modalError}
          </div>
        )}

        {welderModal.isBrigade && (
          <div className="p-3 rounded-lg bg-[#e8f1fc] border border-sky-200 space-y-2">
            <div className="font-bold text-[#1e3799]">
              Выберите сварщиков в состав бригады — ФИО, удостоверения и способы сварки объединятся автоматически
            </div>
            <div className="flex flex-wrap gap-2">
              {personalWelders.map((pw) => {
                const checked = (welderForm.brigadeMembers || []).includes(pw.stamp);
                return (
                  <button
                    key={pw.stamp}
                    type="button"
                    onClick={() => toggleBrigadeMemberInForm(pw.stamp)}
                    className={`px-2.5 py-1.5 rounded-md border font-mono text-xs transition-colors cursor-pointer ${
                      checked
                        ? 'bg-[#1e3799] text-white border-[#1e3799] font-bold'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {pw.stamp} · {pw.fullName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              {welderModal.isBrigade ? 'Бригадное клеймо *' : 'Личное клеймо сварщика *'}
            </label>
            <input
              type="text"
              required
              value={welderForm.stamp}
              onChange={(e) =>
                setWelderForm((prev) => ({ ...prev, stamp: e.target.value }))
              }
              placeholder={welderModal.isBrigade ? 'БР-01' : 'А142'}
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-[#1e3799]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">
              {welderModal.isBrigade ? 'Состав бригады *' : 'ФИО сварщика *'}
            </label>
            <input
              type="text"
              required
              value={welderForm.fullName}
              onChange={(e) =>
                setWelderForm((prev) => ({ ...prev, fullName: e.target.value }))
              }
              placeholder={
                welderModal.isBrigade
                  ? 'Иванов И.И., Петров П.П.'
                  : 'Иванов Иван Иванович'
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              № основного удостоверения НАКС *
            </label>
            <input
              type="text"
              required={(welderForm.naksCerts || []).length === 0}
              value={welderForm.certNumber}
              onChange={(e) =>
                setWelderForm((prev) => ({ ...prev, certNumber: e.target.value }))
              }
              placeholder="Напр.: УР-1АЦ-I-04512"
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="flex justify-between font-medium text-slate-700 mb-1">
              <span>Дата выдачи</span>
              <span className="font-mono text-[#1e3799]">
                {formatDateDDMMYY(welderForm.certIssueDate)}
              </span>
            </label>
            <input
              type="date"
              value={welderForm.certIssueDate || ''}
              onChange={(e) =>
                setWelderForm((prev) => ({ ...prev, certIssueDate: e.target.value }))
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="flex justify-between font-medium text-slate-700 mb-1">
              <span>Срок действия до</span>
              <span className="font-mono text-[#1e3799]">
                {formatDateDDMMYY(welderForm.certExpiryDate)}
              </span>
            </label>
            <input
              type="date"
              value={welderForm.certExpiryDate || ''}
              onChange={(e) =>
                setWelderForm((prev) => ({ ...prev, certExpiryDate: e.target.value }))
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
            />
            {welderForm.certExpiryDate && (() => {
              const status = checkNaksCertStatus(welderForm.certExpiryDate);
              return (
                <div className="mt-1">
                  {status.badgeVariant === 'expired' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                      {status.message}
                    </span>
                  )}
                  {status.badgeVariant === 'expiring' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      {status.message}
                    </span>
                  )}
                  {status.badgeVariant === 'valid' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      {status.message}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-700 mb-1">
            Область аттестации
          </label>
          <input
            type="text"
            value={welderForm.attestationArea || ''}
            onChange={(e) =>
              setWelderForm((prev) => ({ ...prev, attestationArea: e.target.value }))
            }
            placeholder="Напр.: РАД, РД · НГДО п. 3, 4 · М01 · Ø57–530 мм, S 4.0–20.0 мм"
            className="w-full px-3 py-2 border border-slate-300 rounded-md"
          />
        </div>

        {/* Допущенные способы сварки и группы сталей */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="text-[11px] font-bold text-slate-800">
            Параметры аттестации НАКС для автоматической проверки стыков
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-600 mb-1.5">
                Допущенные способы сварки
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_WELDING_METHODS.map((method) => {
                  const active = welderForm.allowedMethods.includes(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => toggleAllowedMethod(method)}
                      className={`px-2 py-1 rounded border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-slate-600 mb-1.5">
                Группы свариваемых сталей
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from(
                  new Set([...STANDARD_STEEL_GROUPS, ...(welderForm.steelGroups || [])])
                ).map((sg) => {
                  const active = (welderForm.steelGroups || []).includes(sg);
                  return (
                    <button
                      key={sg}
                      type="button"
                      onClick={() => toggleSteelGroup(sg)}
                      className={`px-2 py-1 rounded border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {sg}
                    </button>
                  );
                })}
                <div className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={customSteelGroup}
                    onChange={(e) => setCustomSteelGroup(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomSteelGroup();
                      }
                    }}
                    placeholder="Своя"
                    className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSteelGroup}
                    className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="Добавить группу стали"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[10px] text-slate-600 mb-0.5">
                Мин. диаметр Ø, мм
              </label>
              <input
                type="number"
                step="any"
                value={welderForm.minDiameterMm ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : undefined;
                  setWelderForm((prev) => ({ ...prev, minDiameterMm: val }));
                }}
                placeholder="57"
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-0.5">
                Макс. диаметр Ø, мм
              </label>
              <input
                type="number"
                step="any"
                value={welderForm.maxDiameterMm ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : undefined;
                  setWelderForm((prev) => ({ ...prev, maxDiameterMm: val }));
                }}
                placeholder="530"
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-0.5">
                Мин. толщина S, мм
              </label>
              <input
                type="number"
                step="any"
                value={welderForm.minWallThicknessMm ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : undefined;
                  setWelderForm((prev) => ({ ...prev, minWallThicknessMm: val }));
                }}
                placeholder="4.0"
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-0.5">
                Макс. толщина S, мм
              </label>
              <input
                type="number"
                step="any"
                value={welderForm.maxWallThicknessMm ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : undefined;
                  setWelderForm((prev) => ({ ...prev, maxWallThicknessMm: val }));
                }}
                placeholder="20.0"
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Удостоверения НАКС по отдельным способам сварки */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#1e3799]">
              Удостоверения НАКС по отдельным способам сварки
            </span>
            <button
              type="button"
              onClick={handleAddNaksCert}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-sky-300 bg-sky-50 text-[#1e3799] hover:bg-sky-100 text-[11px] font-semibold cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Добавить удостоверение</span>
            </button>
          </div>

          {(welderForm.naksCerts || []).length === 0 ? (
            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500">
              Если у сварщика несколько удостоверений НАКС на разные способы сварки, добавьте их здесь для раздельной проверки сроков и допусков.
            </div>
          ) : (
            <div className="space-y-2">
              {(welderForm.naksCerts || []).map((cert, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr_130px_130px_auto] gap-2 items-end">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Способ
                      </label>
                      <select
                        value={cert.weldingType}
                        onChange={(e) =>
                          updateNaksCert(idx, {
                            weldingType: e.target.value as WeldingType,
                          })
                        }
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                      >
                        {ALL_WELDING_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        № удостоверения НАКС *
                      </label>
                      <input
                        type="text"
                        value={cert.certNumber}
                        onChange={(e) =>
                          updateNaksCert(idx, { certNumber: e.target.value })
                        }
                        placeholder="УР-1АЦ-I-04512"
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Выдано
                      </label>
                      <input
                        type="date"
                        value={cert.issueDate || ''}
                        onChange={(e) =>
                          updateNaksCert(idx, { issueDate: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Действует до
                      </label>
                      <input
                        type="date"
                        value={cert.expiryDate || ''}
                        onChange={(e) =>
                          updateNaksCert(idx, { expiryDate: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNaksCert(idx)}
                      className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      title="Удалить удостоверение"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <div className="col-span-2 sm:col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        № допускного листа
                      </label>
                      <input
                        type="text"
                        value={cert.admissionSheetNumber || ''}
                        onChange={(e) =>
                          updateNaksCert(idx, {
                            admissionSheetNumber: e.target.value,
                          })
                        }
                        placeholder="ДЛ-045/26-01"
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Ø от, мм
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={cert.minDiameterMm ?? ''}
                        onChange={(e) =>
                          updateNaksCert(idx, {
                            minDiameterMm: e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          })
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Ø до, мм
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={cert.maxDiameterMm ?? ''}
                        onChange={(e) =>
                          updateNaksCert(idx, {
                            maxDiameterMm: e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          })
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        S от, мм
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={cert.minWallThicknessMm ?? ''}
                        onChange={(e) =>
                          updateNaksCert(idx, {
                            minWallThicknessMm: e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          })
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        S до, мм
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={cert.maxWallThicknessMm ?? ''}
                        onChange={(e) =>
                          updateNaksCert(idx, {
                            maxWallThicknessMm: e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          })
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              № допускного листа
            </label>
            <input
              type="text"
              value={welderForm.admissionSheetNumber || ''}
              onChange={(e) =>
                setWelderForm((prev) => ({
                  ...prev,
                  admissionSheetNumber: e.target.value,
                }))
              }
              placeholder="Напр.: ДЛ-045/26-030"
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="flex justify-between font-medium text-slate-700 mb-1">
              <span>Дата допускного листа</span>
              <span className="font-mono text-[#1e3799]">
                {formatDateDDMMYY(welderForm.admissionSheetDate)}
              </span>
            </label>
            <input
              type="date"
              value={welderForm.admissionSheetDate || ''}
              onChange={(e) =>
                setWelderForm((prev) => ({
                  ...prev,
                  admissionSheetDate: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Ответственный мастер / прораб
            </label>
            <input
              type="text"
              list="welder-foremen-suggestions"
              value={welderForm.crewForeman}
              onChange={(e) =>
                setWelderForm((prev) => ({ ...prev, crewForeman: e.target.value }))
              }
              placeholder="Напр.: Мастер СМР Иванов И.И."
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
            {existingForemen.length > 0 && (
              <datalist id="welder-foremen-suggestions">
                {existingForemen.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <div>
            {welderModal.item &&
              onDeleteWelder &&
              (confirmModalDelete ? (
                <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">
                  <span className="text-[11px] font-semibold text-red-800">
                    Удалить запись?
                  </span>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={async () => {
                      if (!welderModal.item) return;
                      setModalError('');
                      setIsSaving(true);
                      try {
                        const res = await onDeleteWelder(welderModal.item.stamp);
                        if (res && res.ok === false) {
                          setModalError(
                            res.error || 'Не удалось удалить запись сварщика.'
                          );
                          setConfirmModalDelete(false);
                          return;
                        }
                        setWelderModal({
                          isOpen: false,
                          isBrigade: false,
                          item: null,
                        });
                        setConfirmModalDelete(false);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 cursor-pointer"
                  >
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmModalDelete(false)}
                    className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setConfirmModalDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {welderModal.isBrigade ? 'Удалить бригаду' : 'Удалить сварщика'}
                  </span>
                </button>
              ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={closeWelderModal}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
  );
};
