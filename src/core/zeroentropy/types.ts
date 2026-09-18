export const IndexableEntityType = {
  FILE: 'file',
} as const;
export type IndexableEntityType =
  (typeof IndexableEntityType)[keyof typeof IndexableEntityType];

export const SyncOperation = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;
export type SyncOperation = (typeof SyncOperation)[keyof typeof SyncOperation];

export const EntityIndexStatus = {
  PENDING: 'pending',
  INDEXING: 'indexing',
  INDEXED: 'indexed',
  ERROR: 'error',
  DELETED: 'deleted',
} as const;
export type EntityIndexStatus =
  (typeof EntityIndexStatus)[keyof typeof EntityIndexStatus];

export const CollectionStatus = {
  PENDING: 'pending',
  CREATING: 'creating',
  ACTIVE: 'active',
  SYNCING: 'syncing',
  ERROR: 'error',
  DELETED: 'deleted',
} as const;
export type CollectionStatus =
  (typeof CollectionStatus)[keyof typeof CollectionStatus];

export const DataSource = {
  USER_UPLOAD: 'user_upload',
  USER_EDIT: 'user_edit',
  API: 'api',
  RETRY: 'retry',
} as const;
export type DataSource = (typeof DataSource)[keyof typeof DataSource];

export const ZeroEntropyContentKind = {
  TEXT: 'text',
  TEXT_PAGES_UNORDERED: 'text-pages-unordered',
  AUTO: 'auto',
} as const;
export type ZeroEntropyContentKind =
  (typeof ZeroEntropyContentKind)[keyof typeof ZeroEntropyContentKind];

export type EntityIndexMetadataValue = string | number | boolean | string[];

export type EntityIndexMetadata = {
  entityType: IndexableEntityType;
  entityId: string;
  organizationId: string;
  updatedAt: string;
  docType: string;
  source: DataSource;
} & Record<string, EntityIndexMetadataValue>;

export type ZeroEntropyTextContent = {
  kind: typeof ZeroEntropyContentKind.TEXT;
  text: string;
};

export type ZeroEntropyTextPagesUnorderedContent = {
  kind: typeof ZeroEntropyContentKind.TEXT_PAGES_UNORDERED;
  pages: string[];
};

export type ZeroEntropyAutoContent = {
  kind: typeof ZeroEntropyContentKind.AUTO;
  base64Data: string;
};

export type ZeroEntropyDocumentContent =
  | ZeroEntropyTextContent
  | ZeroEntropyTextPagesUnorderedContent
  | ZeroEntropyAutoContent;

export type EntityToIndex = {
  entityId: string;
  entityType: IndexableEntityType;
  organizationId: string;
  docType: string;
  content: ZeroEntropyDocumentContent;
  metadata: EntityIndexMetadata;
};

export type EntityChangeEvent = {
  eventId: string;
  operation: SyncOperation;
  entityType: IndexableEntityType;
  entityId: string;
  organizationId: string;
  source: DataSource;
  timestamp: Date;
};

export type CollectionInfo = {
  id: string;
  collectionName: string;
  organizationId: string;
  status: CollectionStatus;
  documentCount: number;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
};

export type IndexedEntityRecord = {
  id: string;
  collectionId: string;
  entityType: IndexableEntityType;
  entityId: string;
  docTypes: string[];
  contentHash: string;
  status: EntityIndexStatus;
  lastError: string | null;
  lastIndexedAt: Date | null;
};

export type ZeroEntropyWireMetadata = Record<string, string | string[]>;

export type ZeroEntropySnippet = {
  path: string;
  content: string;
  score: number;
  pageSpan: [number, number] | null;
  documentMetadata: ZeroEntropyWireMetadata;
};

export type ZeroEntropyDocumentInfo = {
  path: string;
  metadata: ZeroEntropyWireMetadata;
};
