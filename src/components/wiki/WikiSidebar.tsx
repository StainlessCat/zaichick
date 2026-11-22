import React from 'react';
import {
  BookOpen,
  Search,
  X,
  Layers,
  FileCheck2,
  Activity,
  FolderGit2,
  FileSpreadsheet,
  Package,
  CloudSun,
  ShieldAlert,
  GraduationCap,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { WikiArticle, WikiCategory, WikiRoleFilter } from '../../data/wiki/types';

interface WikiSidebarProps {
  categories: WikiCategory[];
  articles: WikiArticle[];
  selectedArticleId: string;
  onSelectArticle: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeRoleFilter: WikiRoleFilter;
  onRoleFilterChange: (role: WikiRoleFilter) => void;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  quickstart: Layers,
  linelist_joints: FileCheck2,
  laboratory_ndt: Activity,
  circuits_hydro: FolderGit2,
  welding_journals: FileSpreadsheet,
  lrv_materials: Package,
  weather_thermal: CloudSun,
  wps_naks: ShieldAlert,
  qa_cheat_sheet: GraduationCap,
  deployment_admin: Settings,
};

const ROLE_OPTIONS: { id: WikiRoleFilter; label: string }[] = [
  { id: 'ALL', label: 'Все роли' },
  { id: 'PTO', label: 'ПТО' },
  { id: 'LNK', label: 'ЛНК' },
  { id: 'OGS', label: 'ОГС' },
  { id: 'ADMIN', label: 'Администратор' },
];

export const WikiSidebar: React.FC<WikiSidebarProps> = ({
  categories,
  articles,
  selectedArticleId,
  onSelectArticle,
  searchQuery,
  onSearchChange,
  activeRoleFilter,
  onRoleFilterChange,
}) => {
  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col overflow-hidden max-h-[calc(100vh-140px)] sticky top-20">
      {/* Шапка сайдбара */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#1e3799]" />
            <span className="font-bold text-sm text-slate-900">База знаний</span>
          </div>
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
            {articles.length} ст.
          </span>
        </div>

        {/* Поле поиска */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск по разделам, ГОСТ, формулам..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1e3799]/20 focus:border-[#1e3799] transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              title="Очистить поиск"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Фильтр по ролям */}
        <div className="flex flex-wrap gap-1 pt-1">
          {ROLE_OPTIONS.map((opt) => {
            const isSelected = activeRoleFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onRoleFilterChange(opt.id)}
                className={`px-2 py-1 rounded-md text-2xs font-medium transition-all ${
                  isSelected
                    ? 'bg-[#1e3799] text-white shadow-2xs font-semibold'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Список статей сгруппированный по категориям */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 text-xs divide-y divide-slate-100">
        {categories.map((cat) => {
          const categoryArticles = articles.filter((a) => a.categoryId === cat.id);
          if (categoryArticles.length === 0) return null;

          const IconComponent = CATEGORY_ICONS[cat.id] || BookOpen;

          return (
            <div key={cat.id} className="pt-3 first:pt-0 space-y-1">
              <div className="px-2 py-1 flex items-center gap-2 text-slate-400 font-semibold text-2xs uppercase tracking-wider">
                <IconComponent className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{cat.title}</span>
              </div>

              <div className="space-y-0.5">
                {categoryArticles.map((art) => {
                  const isActive = art.id === selectedArticleId;
                  return (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => onSelectArticle(art.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-start justify-between gap-2 group ${
                        isActive
                          ? 'bg-[#1e3799]/10 text-[#1e3799] font-bold shadow-2xs border-l-3 border-[#1e3799]'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs leading-snug">{art.title}</div>
                        <div className="text-2xs text-slate-400 truncate mt-0.5 font-normal">
                          {art.shortDescription}
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                          isActive
                            ? 'text-[#1e3799] translate-x-0.5'
                            : 'text-slate-300 group-hover:text-slate-500'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {articles.length === 0 && (
          <div className="p-6 text-center text-slate-400 space-y-2">
            <Search className="w-6 h-6 mx-auto text-slate-300" />
            <p className="text-xs">По вашему запросу ничего не найдено</p>
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onRoleFilterChange('ALL');
              }}
              className="text-2xs text-[#1e3799] hover:underline font-semibold"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
