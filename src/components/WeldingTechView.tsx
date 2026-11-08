import React, { useState } from 'react';
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
} from '../types/welding';
import { WeldersDirectoryView } from './tech/WeldersDirectoryView';
import { TechCardsDirectoryView } from './tech/TechCardsDirectoryView';
import { MaterialsDirectoryView } from './tech/MaterialsDirectoryView';

export interface WeldingTechViewProps {
  welders: WelderProfile[];
  onSaveWelder: (welder: WelderProfile) => void;
  onDeleteWelder?: (stamp: string) => void;
  techCards: TechCardItem[];
  onSaveTechCard: (card: TechCardItem) => void;
  onDeleteTechCard?: (id: string) => void;
  materials: WeldingMaterialCertificate[];
  onSaveMaterial: (material: WeldingMaterialCertificate) => void;
  onDeleteMaterial?: (id: string) => void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

export type TechTab = 'welders' | 'tech_cards' | 'materials';

export const WeldingTechView: React.FC<WeldingTechViewProps> = ({
  welders,
  onSaveWelder,
  onDeleteWelder,
  techCards,
  onSaveTechCard,
  onDeleteTechCard,
  materials,
  onSaveMaterial,
  onDeleteMaterial,
  canEdit = true,
  currentUserRoleLabel = 'Технолог по сварке',
}) => {
  const [activeTab, setActiveTab] = useState<TechTab>('welders');

  return (
    <div className="space-y-4">
      {/* Верхняя панель с переключателями 3 подразделов технологии сварки */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('welders')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'welders'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Сварщики и бригады ({welders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tech_cards')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'tech_cards'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Технологические карты ТК ({techCards.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('materials')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'materials'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Сварочные материалы и ВК ({materials.length})</span>
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Ролевое ограничение (RBAC): Текущая роль — «{currentUserRoleLabel}». Редактирование вкладки «Технология сварки» (НАКС, техкарты ТК, сертификаты СМ) доступно только роли «Технолог по сварке». Включён режим чтения.
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
          onSaveWelder={onSaveWelder}
          onDeleteWelder={onDeleteWelder}
          canEdit={canEdit}
          currentUserRoleLabel={currentUserRoleLabel}
        />
      )}

      {/* ВКЛАДКА 2: ТЕХНОЛОГИЧЕСКИЕ КАРТЫ (ТК) */}
      {activeTab === 'tech_cards' && (
        <TechCardsDirectoryView
          techCards={techCards}
          onSaveTechCard={onSaveTechCard}
          onDeleteTechCard={onDeleteTechCard}
          canEdit={canEdit}
        />
      )}

      {/* ВКЛАДКА 3: СВАРОЧНЫЕ МАТЕРИАЛЫ И ВХОДНОЙ КОНТРОЛЬ (ВК) */}
      {activeTab === 'materials' && (
        <MaterialsDirectoryView
          materials={materials}
          onSaveMaterial={onSaveMaterial}
          onDeleteMaterial={onDeleteMaterial}
          canEdit={canEdit}
        />
      )}
    </div>
  );
};
