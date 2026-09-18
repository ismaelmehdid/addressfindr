export type WebSearchResult = {
  title: string;
  url: string;
  description: string;
};

export type WebSearchQuery = {
  query: string;
  count: number;
};

export const WEB_SEARCH_MIN_COUNT = 1;
export const WEB_SEARCH_MAX_COUNT = 20;
export const WEB_SEARCH_DEFAULT_COUNT = 5;
