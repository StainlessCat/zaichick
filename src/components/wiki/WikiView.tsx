import React, { useState, useMemo } from 'react';
import { WikiArticle, WikiRoleFilter } from '../../data/wiki/types';
import { WIKI_ARTICLES, WIKI_CATEGORIES } from '../../data/wiki/wikiData';
import { WikiSidebar } from './WikiSidebar';
import { WikiArticleView } from './WikiArticleView';
import { WikiTableOfContents } from './WikiTableOfContents';
import { AppSection } from '../../types/welding';

interface WikiViewProps {
  onNavigateSection?: (section: AppSection) => void;
}

export const WikiView: React.FC<WikiViewProps> = ({ onNavigateSection }) => {
  const [selectedArticleId, setSelectedArticleId] = useState<string>('quickstart-architecture');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeRoleFilter, setActiveRoleFilter] = useState<WikiRoleFilter>('ALL');
  const [activeSubSectionId, setActiveSubSectionId] = useState<string>('');

  // Фильтрация статей по поисковому запросу и выбранной роли
  const filteredArticles = useMemo(() => {
    return WIKI_ARTICLES.filter((article) => {
      // Фильтр по роли
      if (activeRoleFilter !== 'ALL') {
        const matchesRole =
          article.targetRoles.includes('ALL') ||
          article.targetRoles.includes(activeRoleFilter);
        if (!matchesRole) return false;
      }

      // Фильтр по поиску
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const inTitle = article.title.toLowerCase().includes(q);
      const inDesc = article.shortDescription.toLowerCase().includes(q);
      const inTags = article.tags.some((t) => t.toLowerCase().includes(q));
      const inDocs = article.normativeDocs?.some((d) => d.toLowerCase().includes(q));
      const inSubsections = article.subsections.some(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q) ||
          s.callouts?.some((c) => c.title.toLowerCase().includes(q) || c.content.toLowerCase().includes(q))
      );
      const inFaqs = article.faqs?.some(
        (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
      );

      return inTitle || inDesc || inTags || inDocs || inSubsections || inFaqs;
    });
  }, [searchQuery, activeRoleFilter]);

  // Текущая выбранная статья (или первая отфильтрованная)
  const currentArticle: WikiArticle | undefined = useMemo(() => {
    const found = filteredArticles.find((a) => a.id === selectedArticleId);
    if (found) return found;
    return filteredArticles[0] || WIKI_ARTICLES[0];
  }, [filteredArticles, selectedArticleId]);

  const currentCategory = useMemo(() => {
    if (!currentArticle) return undefined;
    return WIKI_CATEGORIES.find((c) => c.id === currentArticle.categoryId);
  }, [currentArticle]);

  const handleSelectSubSection = (id: string) => {
    setActiveSubSectionId(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6 pb-12 wiki-root">
      {/* 3-панельная компоновка: Сайдбар | Статья | Содержание */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <WikiSidebar
          categories={WIKI_CATEGORIES}
          articles={filteredArticles}
          selectedArticleId={currentArticle?.id || ''}
          onSelectArticle={(id) => {
            setSelectedArticleId(id);
            setActiveSubSectionId('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeRoleFilter={activeRoleFilter}
          onRoleFilterChange={setActiveRoleFilter}
        />

        {currentArticle ? (
          <>
            <WikiArticleView
              article={currentArticle}
              category={currentCategory}
              onNavigateSection={onNavigateSection}
            />

            <WikiTableOfContents
              subsections={currentArticle.subsections}
              hasFaqs={Boolean(currentArticle.faqs && currentArticle.faqs.length > 0)}
              actionLinks={currentArticle.actionLinks}
              onNavigateSection={onNavigateSection}
              activeSubSectionId={activeSubSectionId}
              onSelectSubSection={handleSelectSubSection}
            />
          </>
        ) : (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            Ничего не найдено. Попробуйте изменить параметры поиска или фильтр ролей.
          </div>
        )}
      </div>
    </div>
  );
};
