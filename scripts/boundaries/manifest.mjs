export const DOMAINS = [
  {
    name: 'auth',
    dirs: [
      'src/infra/auth',
      'src/application/me',
      'src/application/settings',
      'src/app/auth',
      'src/app/(public)/sign-in',
      'src/app/(app)/dashboard/settings',
    ],
    schemas: ['src/infra/database/schema/auth-schema'],
    public: [
      'src/infra/auth/auth',
      'src/application/me/get-current-user',
      'src/application/me/user-scope',
    ],
    openToAll: true,
  },
  {
    name: 'files',
    dirs: [
      'src/core/file',
      'src/core/storage',
      'src/application/files',
      'src/application/storage',
      'src/infra/data-access/file',
      'src/infra/external-apis/supabase-storage',
      'src/app/api/files',
    ],
    schemas: ['src/infra/database/schema/file-schema'],
    public: [
      'src/application/files/dto',
      'src/application/files/get-file',
      'src/application/files/get-file-entity',
      'src/application/files/list-files',
      'src/application/files/initiate-upload',
      'src/application/files/finalize-upload',
      'src/application/files/delete-file',
      'src/application/files/rename-file',
      'src/application/files/get-download-url',
      'src/application/files/get-download-urls-bulk',
      'src/application/files/download-file-buffer',
      'src/application/files/create-signed-download-url',
      'src/application/storage/dto',
      'src/application/storage/create-signed-upload-url',
      'src/core/file/types',
      'src/core/file/markdown-chunk',
      'src/core/file/mime-mapping',
      'src/core/storage/types/bucket',
      'src/core/storage/types/file',
      'src/core/storage/types/signed-url',
      'src/core/storage/types/image-transform',
    ],
  },
  {
    name: 'indexing',
    dirs: [
      'src/core/zeroentropy',
      'src/core/retrieval',
      'src/application/zeroentropy',
      'src/application/retrieval',
      'src/infra/data-access/zeroentropy',
      'src/infra/external-apis/zeroentropy',
      'src/infra/external-apis/mammoth',
      'src/infra/external-apis/xlsx',
      'src/app/api/cron/zeroentropy-retry',
    ],
    schemas: ['src/infra/database/schema/zeroentropy-schema'],
    public: [
      'src/application/zeroentropy/entity-sync-orchestrator',
      'src/application/zeroentropy/query-snippets',
      'src/core/zeroentropy/types',
    ],
  },
  {
    name: 'chat',
    dirs: ['src/core/chat'],
    schemas: [],
    public: ['src/core/chat/types'],
  },
  {
    name: 'transcription',
    dirs: [
      'src/core/transcription',
      'src/application/transcription',
      'src/app/api/transcribe',
    ],
    schemas: [],
    public: [
      'src/application/transcription/transcribe-audio',
      'src/core/transcription/limits',
    ],
  },
  {
    name: 'url-fetch',
    dirs: [
      'src/core/url-fetch',
      'src/application/url-fetch',
      'src/infra/external-apis/url-fetcher',
    ],
    schemas: [],
    public: ['src/application/url-fetch/fetch-url', 'src/core/url-fetch/types'],
  },
  {
    name: 'listing',
    dirs: [
      'src/core/listing',
      'src/application/listing',
      'src/app/(app)/dashboard/components/listing',
      'src/infra/external-apis/firecrawl',
      'src/infra/external-apis/groq',
      'src/app/api/listings',
    ],
    schemas: [],
    public: [
      'src/application/listing/extract-listing',
      'src/application/listing/dto',
      'src/core/listing/types',
      'src/app/(app)/dashboard/components/listing/listing-url-form',
    ],
  },
  {
    name: 'ademe',
    dirs: [
      'src/core/ademe',
      'src/application/ademe',
      'src/infra/external-apis/ademe',
      'src/app/api/listings/match',
    ],
    schemas: [],
    public: [
      'src/application/ademe/find-address-candidates',
      'src/application/ademe/dto',
      'src/core/ademe/types',
    ],
  },
  {
    name: 'commune',
    dirs: [
      'src/core/commune',
      'src/application/commune',
      'src/infra/external-apis/geo-gouv',
    ],
    schemas: [],
    public: [
      'src/application/commune/resolve-commune',
      'src/application/commune/dto',
      'src/core/commune/types',
    ],
  },
  {
    name: 'web-search',
    dirs: [
      'src/core/web-search',
      'src/application/web-search',
      'src/infra/external-apis/brave-search',
    ],
    schemas: [],
    public: [
      'src/application/web-search/search-web',
      'src/core/web-search/types',
    ],
  },
  {
    name: 'rate-limit',
    dirs: [
      'src/core/rate-limit',
      'src/application/rate-limit',
      'src/infra/external-apis/redis',
    ],
    schemas: [],
    public: [
      'src/application/rate-limit/apply-rate-limit',
      'src/application/rate-limit/llm-cost-limiter',
      'src/core/rate-limit/llm-cost-config',
      'src/infra/external-apis/redis/client',
    ],
    openToAll: true,
  },
  {
    name: 'email',
    dirs: [
      'src/core/email',
      'src/infra/email',
      'src/infra/external-apis/resend',
      'src/infra/external-apis/smtp',
    ],
    schemas: [],
    public: ['src/infra/email/email-sender'],
    openToAll: true,
  },
  {
    name: 'billing',
    dirs: [
      'src/core/billing',
      'src/application/billing',
      'src/infra/external-apis/autumn',
      'src/app/(app)/paywall',
      'src/app/api/autumn',
      'src/app/api/billing',
    ],
    schemas: [],
    // Reads the current user id via the auth domain (openToAll); nothing
    // else depends on it yet, so no ALLOWED_EDGES entry is required.
    public: ['src/application/billing/get-app-entitlement'],
  },
];

export const ALLOWED_EDGES = [
  ['indexing', 'files'],
  ['files', 'indexing'],
  // ademe lit les champs extraits d'une annonce et a besoin du code INSEE
  // de sa commune pour interroger la base DPE.
  ['ademe', 'listing'],
  ['ademe', 'commune'],
  // le retour : le formulaire d'annonce enchaine l'extraction sur la recherche
  // d'adresse et affiche ses candidats. Couplage bidirectionnel assume, sur le
  // modele de files <-> indexing : aucun cycle d'import au niveau des modules,
  // ademe ne depend que de core/listing, listing que de l'API publique d'ademe.
  ['listing', 'ademe'],
];

export const SHARED_PREFIXES = [
  'src/shared',
  'src/lib',
  'src/components',
  'src/hooks',
  'src/i18n',
  'src/core/errors',
  'src/core/types',
  'src/core/ports',
  'src/global.d',
  'src/proxy',
  'src/instrumentation',
  'src/instrumentation-client',
  'src/infra/external-apis/openai',
];

export const DYNAMIC_IMPORT_ALLOWLIST = [
  // locale catalogs are data files resolved by next-intl, not domain modules
  'src/i18n/request.ts',
];
