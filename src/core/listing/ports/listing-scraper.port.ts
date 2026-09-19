import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';

export type ScrapedPage = {
  markdown: string;
  rawHtml: string;
  finalUrl: string;
};

export interface IListingScraper {
  scrape(input: { url: string }): Promise<Result<ScrapedPage, AppError>>;
}
