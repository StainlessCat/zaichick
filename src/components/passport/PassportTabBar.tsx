import React from 'react';
import { Flame, History, Layers, ShieldCheck, Wrench } from 'lucide-react';
import type { WeldJoint } from '../../types/welding';
import type { RolePermissions } from '../../utils/rbac';
import { isJointDefective } from '../../utils/weldingLogic';

export type PassportTab = 'welding' | 'elements' | 'control' | 'repair' | 'history';

export interface PassportTabBarProps {
  activeTab: PassportTab;
  setActiveTab: (tab: PassportTab) => void;
  form: WeldJoint;
  mode: 'create' | 'edit';
  rbac: RolePermissions;
  auditLogsCount: number;
}

export const PassportTabBar: React.FC<PassportTabBarProps> = ({
  activeTab,
  setActiveTab,
  form,
  mode,
  rbac,
  auditLogsCount,
}) => {
  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
      {/* Таб 1: Сварка */}
      <button
        type="button"
        onClick={() => setActiveTab('welding')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
          activeTab === 'welding'
            ? 'bg-white text-[#1e3799] shadow-xs border border-slate-200 font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <Flame className="w-3.5 h-3.5 text-[#1e3799]" />
        <span>Сварка</span>
      </button>

      {/* Таб 2: Элементы */}
      <button
        type="button"
        onClick={() => setActiveTab('elements')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
          activeTab === 'elements'
            ? 'bg-white text-[#1e3799] shadow-xs border border-slate-200 font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <Layers className="w-3.5 h-3.5 text-[#1e3799]" />
        <span>Элементы</span>
      </button>

      {/* Таб 3: Контроль ВИК / НК */}
      <button
        type="button"
        onClick={() => setActiveTab('control')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
          activeTab === 'control'
            ? 'bg-white text-[#1e3799] shadow-xs border border-slate-200 font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-[#1e3799]" />
        <span>Контроль ВИК / НК</span>
      </button>

      {/* Таб 4: Ремонт */}
      <button
        type="button"
        onClick={() => setActiveTab('repair')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
          activeTab === 'repair'
            ? 'bg-white text-[#1e3799] shadow-xs border border-slate-200 font-bold'
            : isJointDefective(form)
            ? 'bg-red-50 text-red-800 border border-red-200/80 hover:bg-red-100'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <Wrench className="w-3.5 h-3.5 text-amber-600" />
        <span>Ремонт</span>
        {isJointDefective(form) && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-600 text-white shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            Дефект
          </span>
        )}
      </button>

      {/* Таб 5: История (только для Администратора) */}
      {mode === 'edit' && rbac.category === 'admin' && (
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'history'
              ? 'bg-white text-[#1e3799] shadow-xs border border-slate-200 font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <History className="w-3.5 h-3.5 text-slate-500" />
          <span>История</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-200 text-slate-700">
            {auditLogsCount}
          </span>
        </button>
      )}
    </div>
  );
};
