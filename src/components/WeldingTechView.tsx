import React, { useMemo, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  FileCheck2,
  Lock,
  PackageCheck,
  Users,
} from 'lucide-react';
import {
  TechCardItem,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { WeldersDirectoryView } from './tech/WeldersDirectoryView';
import { TechCardsDirectoryView } from './tech/TechCardsDirectoryView';
import { MaterialsDirectoryView } from './tech/MaterialsDirectoryView';
import { useAuth, useAppContext } from '../context';
import { computeTechUsageCounts } from '../utils/weldingTechUtils';

export type SaveActionResult = Promise<{ ok: boolean; error?: string } | void> | void;

export interface WeldingTechViewProps {
  welders?: WelderProfile[];
  onSaveWelder: (welder: WelderProfile) => SaveActionResult;
  onDeleteWelder?: (stamp: string) => SaveActionResult;
  techCards?: TechCardItem[];
  onSaveTechCard: (card: TechCardItem) => SaveActionResult;
  onDeleteTechCard?: (id: string) => SaveActionResult;
  materials?: WeldingMaterialCertificate[];
  onSaveMaterial: (material: WeldingMaterialCertificate) => SaveActionResult;
  onDeleteMaterial?: (id: string) => SaveActionResult;
  joints?: WeldJoint[];
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

export type TechTab = 'welders' | 'tech_cards' | 'materials';

export const WeldingTechView: React.FC<WeldingTechViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const welders = props.welders ?? app.welders;
  const techCards = props.techCards ?? app.techCards;
  const materials = props.materials ?? app.weldingMaterials;
  const joints = props.joints ?? app.joints;
  const canEdit = props.canEdit ?? auth.userPermissions.canEditWeldingTech;
  const currentUserRoleLabel = props.currentUserRoleLabel ?? auth.userPermissions.categoryLabel;

  const {
    onSaveWelder,
    onDeleteWelder,
    onSaveTechCard,
    onDeleteTechCard,
    onSaveMaterial,
    onDeleteMaterial,
  } = props;
  const [activeTab, setActiveTab] = usePersistentState<TechTab>('weldingTech:activeTab', 'welders');

  const usageCounts = useMemo(
    () => computeTechUsageCounts(joints, techCards, welders, materials),
    [joints, techCards, welders, materials]
  );

  return (
    <div className="space-y-4">
      {/* Верхняя панель с переключателями 3 подразделов технологии сварки */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('welders')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'welders'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Сварщики и бригады</span>
            <span
              className={`px-1.5 py-0.25 rounded text-[10px] font-mono font-bold ${
                activeTab === 'welders'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {welders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tech_cards')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'tech_cards'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Технологические карты</span>
            <span
              className={`px-1.5 py-0.25 rounded text-[10px] font-mono font-bold ${
                activeTab === 'tech_cards'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {techCards.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('materials')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'materials'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Сварочные материалы и ВК</span>
            <span
              className={`px-1.5 py-0.25 rounded text-[10px] font-mono font-bold ${
                activeTab === 'materials'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {materials.length}
            </span>
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Текущая роль — «{currentUserRoleLabel}». Редактирование справочников раздела «Технология сварки» доступно роли «Технолог по сварке».
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 font-mono text-[11px] shrink-0">
            Только чтение
          </span>
        </div>
      )}

      {/* ВКЛАДКА 1: СВАРЩИКИ И БРИГАДНЫЕ КЛЕЙМА */}
      {activeTab === 'welders' && (
        <WeldersDirectoryView
          welders={welders}
          usageCounts={usageCounts.welderCounts}
          onSaveWelder={onSaveWelder}
          onDeleteWelder={onDeleteWelder}
          canEdit={canEdit}
          currentUserRoleLabel={currentUserRoleLabel}
        />
      )}

      {/* ВКЛАДКА 2: ТЕХНОЛОГИЧЕСКИЕ КАРТЫ */}
      {activeTab === 'tech_cards' && (
        <TechCardsDirectoryView
          techCards={techCards}
          materials={materials}
          usageCounts={usageCounts.techCardCounts}
          onSaveTechCard={onSaveTechCard}
          onDeleteTechCard={onDeleteTechCard}
          canEdit={canEdit}
        />
      )}

      {/* ВКЛАДКА 3: СВАРОЧНЫЕ МАТЕРИАЛЫ И ВХОДНОЙ КОНТРОЛЬ */}
      {activeTab === 'materials' && (
        <MaterialsDirectoryView
          materials={materials}
          usageCounts={usageCounts.materialCounts}
          onSaveMaterial={onSaveMaterial}
          onDeleteMaterial={onDeleteMaterial}
          canEdit={canEdit}
        />
      )}
    </div>
  );
};
