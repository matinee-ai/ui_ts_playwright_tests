/**
 * The three projects under test. Base URLs can be overridden per environment
 * (e.g. to point a run at staging): CHESSORRO_URL, QASTARTING_URL, SPAS_URL.
 */
import type { Project } from '../scripts/schedule.ts';

export type SiteKey = Project;

export interface SiteConfig {
  key: SiteKey;
  name: string;
  /** Origin without a trailing slash, e.g. https://www.spas.life */
  baseURL: string;
  /** Landing page path, e.g. "/en". */
  homePath: string;
  /** Max time for the landing page HTML to arrive. */
  responseBudgetMs: number;
  /** Contact details the site must publish (checked in API + UI suites). */
  contacts: {
    emails: string[];
    /** Digits only, including the country code. */
    phones: string[];
    telegram: string[];
  };
}

function origin(envName: string, fallback: string): string {
  return (process.env[envName] || fallback).replace(/\/+$/, '');
}

export const SITES: Record<SiteKey, SiteConfig> = {
  chessorro: {
    key: 'chessorro',
    name: 'Chessorro',
    baseURL: origin('CHESSORRO_URL', 'https://www.chessorro.com'),
    homePath: '/en',
    responseBudgetMs: 4000,
    contacts: { emails: [], phones: [], telegram: [] },
  },
  qastarting: {
    key: 'qastarting',
    name: 'QA Starting',
    baseURL: origin('QASTARTING_URL', 'https://www.qastarting.org'),
    homePath: '/',
    responseBudgetMs: 4000,
    contacts: { emails: ['qastarting@gmail.com'], phones: ['13109204331'], telegram: [] },
  },
  spas: {
    key: 'spas',
    name: 'Spas Life',
    baseURL: origin('SPAS_URL', 'https://www.spas.life'),
    homePath: '/',
    responseBudgetMs: 4000,
    contacts: { emails: ['support@spas.life'], phones: ['19545010763'], telegram: ['spaslife_ch'] },
  },
};

export const SITE_LIST = Object.values(SITES);
