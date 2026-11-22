import { AppSection } from '../../types/welding';

export type WikiRoleFilter = 'ALL' | 'PTO' | 'LNK' | 'OGS' | 'ADMIN';

export type WikiCalloutType = 'standard' | 'important' | 'formula' | 'example';

export interface WikiCallout {
  type: WikiCalloutType;
  title: string;
  content: string;
}

export interface WikiActionLink {
  label: string;
  targetSection: AppSection;
  description?: string;
  icon?: string;
}

export interface WikiFaq {
  question: string;
  answer: string;
}

export interface WikiSubSection {
  id: string;
  title: string;
  content: string;
  callouts?: WikiCallout[];
}

export interface WikiArticle {
  id: string;
  categoryId: string;
  title: string;
  shortDescription: string;
  targetRoles: WikiRoleFilter[];
  tags: string[];
  normativeDocs?: string[];
  subsections: WikiSubSection[];
  actionLinks?: WikiActionLink[];
  faqs?: WikiFaq[];
  lastUpdated?: string;
}

export interface WikiCategory {
  id: string;
  title: string;
  description: string;
  order: number;
}
