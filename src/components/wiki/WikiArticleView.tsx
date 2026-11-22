import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Download,
  AlertCircle,
  HelpCircle,
  BookmarkCheck,
  Calculator,
  ArrowRight,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { WikiArticle, WikiCallout, WikiCategory } from '../../data/wiki/types';
import { AppSection } from '../../types/welding';

interface WikiArticleViewProps {
  article: WikiArticle;
  category?: WikiCategory;
  onNavigateSection?: (section: AppSection) => void;
}

export const WikiArticleView: React.FC<WikiArticleViewProps> = ({
  article,
  category,
  onNavigateSection,
}) => {
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({});

  const toggleFaq = (idx: number) => {
    setOpenFaqs((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const renderCallout = (callout: WikiCallout, idx: number) => {
    switch (callout.type) {
      case 'standard':
        return (
          <div
            key={idx}
            className="my-3.5 p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-950 text-xs space-y-1 shadow-2xs"
          >
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <BookmarkCheck className="w-4 h-4 text-[#1e3799] shrink-0" />
              <span>{callout.title}</span>
            </div>
            <p className="text-blue-900/90 leading-relaxed pl-6">{callout.content}</p>
          </div>
        );
      case 'important':
        return (
          <div
            key={idx}
            className="my-3.5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-xs space-y-1 shadow-2xs"
          >
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{callout.title}</span>
            </div>
            <p className="text-amber-900/90 leading-relaxed pl-6">{callout.content}</p>
          </div>
        );
      case 'formula':
        return (
          <div
            key={idx}
            className="my-3.5 p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs space-y-1.5 shadow-md font-mono"
          >
            <div className="flex items-center gap-2 font-sans font-bold text-amber-400">
              <Calculator className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{callout.title}</span>
            </div>
            <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700 overflow-x-auto text-emerald-300 leading-relaxed">
              {callout.content}
            </div>
          </div>
        );
      default:
        return (
          <div
            key={idx}
            className="my-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs space-y-1"
          >
            <div className="font-bold text-slate-900">{callout.title}</div>
            <p className="text-slate-600 leading-relaxed">{callout.content}</p>
          </div>
        );
    }
  };

  const handleOpenHtmlGuide = () => {
    window.open('/user_guide.html', '_blank', 'noopener,noreferrer');
  };

  return (
    <article className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-2xs space-y-8">
      {/* Шапка статьи и хлебные крошки */}
      <div className="border-b border-slate-100 pb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-2xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>База знаний</span>
            <span>/</span>
            <span className="text-[#1e3799] font-bold">{category?.title || 'Раздел'}</span>
          </div>

          {/* Быстрые действия со справочником (без скобок в названиях) */}
          <div className="flex items-center gap-2">
            <a
              href="/ZAYCHICK_Install_Package.zip"
              download="ZAYCHICK_Install_Package.zip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-2xs font-semibold transition-colors"
              title="Скачать дистрибутив программы"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать архив программы</span>
            </a>
            <button
              type="button"
              onClick={handleOpenHtmlGuide}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-2xs font-semibold transition-colors"
              title="Открыть руководство в отдельной вкладке браузера"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Открыть руководство</span>
            </button>
          </div>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 tracking-tight">
          {article.title}
        </h1>

        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          {article.shortDescription}
        </p>

        {/* Теги и нормативные стандарты */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          {article.normativeDocs?.map((doc, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-2xs font-semibold"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>{doc}</span>
            </span>
          ))}

          {article.tags.map((tag, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-2xs font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Подразделы статьи */}
      <div className="space-y-8">
        {article.subsections.map((sub) => (
          <section key={sub.id} id={sub.id} className="scroll-mt-24 space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-1.5 h-5 bg-[#1e3799] rounded-full inline-block" />
              <span>{sub.title}</span>
            </h2>

            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line space-y-3">
              {sub.content}
            </div>

            {sub.callouts && sub.callouts.length > 0 && (
              <div className="pt-2">
                {sub.callouts.map((callout, cIdx) => renderCallout(callout, cIdx))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Интерактивные ссылки действий внутри программы */}
      {article.actionLinks && article.actionLinks.length > 0 && onNavigateSection && (
        <div className="mt-8 p-5 bg-gradient-to-r from-slate-50 to-blue-50/50 border border-slate-200 rounded-xl space-y-3">
          <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1e3799]" />
            <span>Действия в программе по этой теме</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {article.actionLinks.map((action, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigateSection(action.targetSection)}
                className="text-left p-3 rounded-lg bg-white border border-slate-200 hover:border-[#1e3799] hover:shadow-xs transition-all group flex items-start justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-[#1e3799]">
                    {action.label}
                  </div>
                  {action.description && (
                    <div className="text-2xs text-slate-500 mt-1">
                      {action.description}
                    </div>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#1e3799] group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Часто задаваемые вопросы (FAQ) */}
      {article.faqs && article.faqs.length > 0 && (
        <section id="faqs" className="scroll-mt-24 border-t border-slate-100 pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">
            <HelpCircle className="w-4 h-4 text-[#1e3799]" />
            <span>Часто задаваемые вопросы</span>
          </div>

          <div className="space-y-2">
            {article.faqs.map((faq, idx) => {
              const isOpen = openFaqs[idx] ?? false;
              return (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-lg overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full text-left px-4 py-3 bg-slate-50/70 hover:bg-slate-100 flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 transition-colors"
                  >
                    <span>{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="p-4 text-xs text-slate-600 bg-white border-t border-slate-200 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
};
