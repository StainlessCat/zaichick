import { describe, expect, it } from 'vitest';
import { WIKI_ARTICLES, WIKI_CATEGORIES } from '../data/wiki/wikiData';
import { WikiRoleFilter } from '../data/wiki/types';
import { AppSection } from '../types/welding';

describe('Wiki Knowledge Base & Articles Integrity', () => {
  const validSections: AppSection[] = [
    'registry',
    'testing_circuits',
    'laboratory',
    'project_linelist',
    'welding_tech',
    'journals',
    'readiness',
    'lrv_catalog',
    'audit_log',
    'user_guide',
  ];

  it('all categories have unique IDs and defined titles', () => {
    const categoryIds = WIKI_CATEGORIES.map((c) => c.id);
    const uniqueIds = new Set(categoryIds);
    expect(uniqueIds.size).toBe(categoryIds.length);
    expect(WIKI_CATEGORIES.length).toBeGreaterThanOrEqual(9);

    WIKI_CATEGORIES.forEach((cat) => {
      expect(cat.title.trim().length).toBeGreaterThan(0);
      expect(cat.description.trim().length).toBeGreaterThan(0);
      // AGENTS.md rule: minimize parenthetical text in UI elements
      expect(cat.title).not.toMatch(/\s*\([^)]*\)$/);
    });
  });

  it('all articles reference existing categories and have subsections', () => {
    const validCategoryIds = new Set(WIKI_CATEGORIES.map((c) => c.id));

    expect(WIKI_ARTICLES.length).toBeGreaterThanOrEqual(10);

    WIKI_ARTICLES.forEach((article) => {
      expect(validCategoryIds.has(article.categoryId)).toBe(true);
      expect(article.title.trim().length).toBeGreaterThan(0);
      expect(article.shortDescription.trim().length).toBeGreaterThan(0);
      expect(article.subsections.length).toBeGreaterThan(0);

      article.subsections.forEach((sub) => {
        expect(sub.title.trim().length).toBeGreaterThan(0);
        expect(sub.content.trim().length).toBeGreaterThan(0);
      });

      // Check action links if present
      if (article.actionLinks) {
        article.actionLinks.forEach((link) => {
          expect(validSections).toContain(link.targetSection);
          expect(link.label.trim().length).toBeGreaterThan(0);
          expect(link.label).not.toMatch(/\s*\([^)]*\)$/);
        });
      }
    });
  });

  it('role filter correctly filters articles', () => {
    const filterByRole = (role: WikiRoleFilter) =>
      role === 'ALL'
        ? WIKI_ARTICLES
        : WIKI_ARTICLES.filter(
            (a) => a.targetRoles.includes('ALL') || a.targetRoles.includes(role)
          );

    const allArticles = filterByRole('ALL');
    expect(allArticles.length).toBe(WIKI_ARTICLES.length);

    const lnkArticles = filterByRole('LNK');
    expect(lnkArticles.length).toBeGreaterThan(0);
    expect(lnkArticles.some((a) => a.id === 'laboratory-ndt')).toBe(true);

    const adminArticles = filterByRole('ADMIN');
    expect(adminArticles.length).toBeGreaterThan(0);
    expect(adminArticles.some((a) => a.id === 'deployment-and-admin')).toBe(true);
  });

  it('search finds articles by normative doc and technical terms', () => {
    const searchArticles = (query: string) => {
      const q = query.toLowerCase().trim();
      return WIKI_ARTICLES.filter((article) => {
        const inTitle = article.title.toLowerCase().includes(q);
        const inDesc = article.shortDescription.toLowerCase().includes(q);
        const inTags = article.tags.some((t) => t.toLowerCase().includes(q));
        const inDocs = article.normativeDocs?.some((d) => d.toLowerCase().includes(q));
        const inSubsections = article.subsections.some(
          (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
        );
        return inTitle || inDesc || inTags || inDocs || inSubsections;
      });
    };

    const gazpromSearch = searchArticles('СТО Газпром');
    expect(gazpromSearch.length).toBeGreaterThan(0);

    const formulaSearch = searchArticles('теплопоступление');
    expect(formulaSearch.length).toBeGreaterThan(0);

    const weatherSearch = searchArticles('метеостанц');
    expect(weatherSearch.length).toBeGreaterThan(0);
  });
});
