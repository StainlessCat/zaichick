import React, { useId, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type {
  ExecutiveDocPatch,
  GeodesyStatus,
  PhysicsStatus,
  PreStageStatus,
} from '../../types/executiveDocs';
import {
  EXECUTIVE_DOC_PRIORITY_OPTIONS,
  GEODESY_STATUS_LABELS,
  PHYSICS_STATUS_LABELS,
  PRE_STAGE_STATUS_LABELS,
} from '../../types/executiveDocs';
import { extractPersonSurname } from '../../utils/executiveDocsLogic';

export interface ExecutiveDocsBulkBarProps {
  selectedCount: number;
  isSaving: boolean;
  workProducerSuggestions: string[];
  ptoEngineerSuggestions: string[];
  onApply: (patch: ExecutiveDocPatch) => Promise<void>;
  onClearSelection: () => void;
}

export const ExecutiveDocsBulkBar: React.FC<ExecutiveDocsBulkBarProps> = ({
  selectedCount,
  isSaving,
  workProducerSuggestions,
  ptoEngineerSuggestions,
  onApply,
  onClearSelection,
}) => {
  const [priority, setPriority] = useState<string>('__KEEP__');
  const [workProducer, setWorkProducer] = useState<string>('');
  const [ptoEngineer, setPtoEngineer] = useState<string>('');
  const [preStageStatus, setPreStageStatus] = useState<string>('__KEEP__');
  const [physicsStatus, setPhysicsStatus] = useState<string>('__KEEP__');
  const [geodesyStatus, setGeodesyStatus] = useState<string>('__KEEP__');

  const producerListId = useId();
  const ptoListId = useId();

  if (selectedCount === 0) return null;

  const hasChanges =
    priority !== '__KEEP__' ||
    workProducer.trim() !== '' ||
    ptoEngineer.trim() !== '' ||
    preStageStatus !== '__KEEP__' ||
    physicsStatus !== '__KEEP__' ||
    geodesyStatus !== '__KEEP__';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges || isSaving) return;

    const patch: ExecutiveDocPatch = {};
    if (priority === '__CLEAR__') {
      patch.priority = null;
    } else if (priority !== '__KEEP__') {
      const parsed = Number.parseInt(priority, 10);
      if (!Number.isNaN(parsed)) patch.priority = parsed;
    }
    if (workProducer.trim() !== '') {
      patch.workProducer = extractPersonSurname(workProducer) || workProducer.trim();
    }
    if (ptoEngineer.trim() !== '') {
      patch.ptoEngineer = extractPersonSurname(ptoEngineer) || ptoEngineer.trim();
    }
    if (preStageStatus !== '__KEEP__') {
      patch.preStageStatus = preStageStatus as PreStageStatus;
    }
    if (physicsStatus !== '__KEEP__') {
      patch.physicsStatus = physicsStatus as PhysicsStatus;
    }
    if (geodesyStatus !== '__KEEP__') {
      patch.geodesyStatus = geodesyStatus as GeodesyStatus;
    }

    await onApply(patch);
    setPriority('__KEEP__');
    setWorkProducer('');
    setPtoEngineer('');
    setPreStageStatus('__KEEP__');
    setPhysicsStatus('__KEEP__');
    setGeodesyStatus('__KEEP__');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#f0f5fc] border border-[#1e3799]/25 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-2.5"
    >
      <div className="flex items-center gap-2 pr-2 border-r border-[#1e3799]/15 shrink-0">
        <span className="text-xs font-semibold text-[#1e3799]">
          Выбрано линий:{' '}
          <span className="font-mono tabular-nums font-bold">{selectedCount}</span>
        </span>
      </div>

      <select
        aria-label="Массовый приоритет"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="h-8 px-2 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-800 cursor-pointer"
      >
        <option value="__KEEP__">Приоритет: не менять</option>
        <option value="__CLEAR__">Сбросить приоритет</option>
        {EXECUTIVE_DOC_PRIORITY_OPTIONS.map((num) => (
          <option key={num} value={String(num)}>
            Приоритет {num}
          </option>
        ))}
      </select>

      <input
        type="text"
        list={workProducerSuggestions.length > 0 ? producerListId : undefined}
        value={workProducer}
        onChange={(e) => setWorkProducer(e.target.value)}
        placeholder="Производитель работ"
        className="h-8 w-40 px-2.5 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-900 placeholder:text-slate-400"
      />
      {workProducerSuggestions.length > 0 && (
        <datalist id={producerListId}>
          {workProducerSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      <input
        type="text"
        list={ptoEngineerSuggestions.length > 0 ? ptoListId : undefined}
        value={ptoEngineer}
        onChange={(e) => setPtoEngineer(e.target.value)}
        placeholder="Инженер ПТО"
        className="h-8 w-36 px-2.5 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-900 placeholder:text-slate-400"
      />
      {ptoEngineerSuggestions.length > 0 && (
        <datalist id={ptoListId}>
          {ptoEngineerSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      <select
        aria-label="Массовый предэтап"
        value={preStageStatus}
        onChange={(e) => setPreStageStatus(e.target.value)}
        className="h-8 px-2 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-800 cursor-pointer"
      >
        <option value="__KEEP__">Предэтап: не менять</option>
        <option value="SIGNED">{PRE_STAGE_STATUS_LABELS.SIGNED}</option>
        <option value="NOT_SIGNED">{PRE_STAGE_STATUS_LABELS.NOT_SIGNED}</option>
      </select>

      <select
        aria-label="Массовая физика"
        value={physicsStatus}
        onChange={(e) => setPhysicsStatus(e.target.value)}
        className="h-8 px-2 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-800 cursor-pointer"
      >
        <option value="__KEEP__">Физика: не менять</option>
        <option value="ACCEPTED">{PHYSICS_STATUS_LABELS.ACCEPTED}</option>
        <option value="NOT_ACCEPTED">{PHYSICS_STATUS_LABELS.NOT_ACCEPTED}</option>
      </select>

      <select
        aria-label="Массовая геодезия"
        value={geodesyStatus}
        onChange={(e) => setGeodesyStatus(e.target.value)}
        className="h-8 px-2 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-800 cursor-pointer"
      >
        <option value="__KEEP__">Геодезия: не менять</option>
        <option value="SIGNED">{GEODESY_STATUS_LABELS.SIGNED}</option>
        <option value="NOT_SIGNED">{GEODESY_STATUS_LABELS.NOT_SIGNED}</option>
        <option value="NOT_REQUIRED">{GEODESY_STATUS_LABELS.NOT_REQUIRED}</option>
      </select>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="submit"
          disabled={!hasChanges || isSaving}
          className="h-8 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors whitespace-nowrap shrink-0"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          <span>Применить</span>
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          disabled={isSaving}
          className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition-colors whitespace-nowrap shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span>Снять выбор</span>
        </button>
      </div>
    </form>
  );
};
