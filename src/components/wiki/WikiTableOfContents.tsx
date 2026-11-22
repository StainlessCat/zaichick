import React from 'react';
import { AlignLeft, HelpCircle, ArrowUpRight } from 'lucide-react';
import { WikiActionLink, WikiSubSection } from '../../data/wiki/types';
import { AppSection } from '../../types/welding';

interface WikiTableOfContentsProps {
  subsections: WikiSubSection[];
  hasFaqs?: boolean;
  actionLinks?: WikiActionLink[];
  onNavigateSection?: (section: AppSection) => void;
  activeSubSectionId?: string;
  onSelectSubSection: (id: string) => void;
}

export const WikiTableOfContents: React.FC<WikiTableOfContentsProps> = ({
  subsections,
  hasFaqs,
  actionLinks,
  onNavigateSection,
  activeSubSectionId,
  onSelectSubSection,
}) => {
  return (
    <div className="w-64 shrink-0 hidden xl:block sticky top-20 max-h-[calc(100vh-140px)] overflow-y-auto space-y-4">
      {/* Содержание статьи */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
          <AlignLeft className="w-4 h-4 text-[#1e3799]" />
          <span>На этой странице</span>
        </div>

        <nav className="space-y-1">
          {subsections.map((sub) => {
            const isActive = activeSubSectionId === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSelectSubSection(sub.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors block truncate ${
                  isActive
                    ? 'text-[#1e3799] font-bold bg-[#1e3799]/5 border-l-2 border-[#1e3799]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {sub.title}
              </button>
            );
          })}

          {hasFaqs && (
            <button
              type="button"
              onClick={() => onSelectSubSection('faqs')}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
                activeSubSectionId === 'faqs'
                  ? 'text-[#1e3799] font-bold bg-[#1e3799]/5 border-l-2 border-[#1e3799]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Частые вопросы</span>
            </button>
          )}
        </nav>
      </div>

      {/* Быстрые действия */}
      {actionLinks && actionLinks.length > 0 && onNavigateSection && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2.5">
          <div className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
            Быстрый переход
          </div>
          <div className="space-y-1.5">
            {actionLinks.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigateSection(action.targetSection)}
                className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 text-slate-800 transition-colors group flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 group-hover:text-[#1e3799] truncate">
                    {action.label}
                  </div>
                  {action.description && (
                    <div className="text-2xs text-slate-400 truncate mt-0.5">
                      {action.description}
                    </div>
                  )}
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1e3799] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
