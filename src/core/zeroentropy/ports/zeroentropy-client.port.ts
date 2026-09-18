import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { ZeroEntropyRerankerModel } from '../config';
import type {
  EntityToIndex,
  ZeroEntropyDocumentInfo,
  ZeroEntropySnippet,
} from '../types';

export type ZeroEntropyFilterOperator =
  | { $eq: string }
  | { $ne: string }
  | { $in: string[] }
  | { $nin: string[] }
  | { $gt: string }
  | { $gte: string }
  | { $lt: string }
  | { $lte: string };

export type ZeroEntropyAttributeFilter = Record<
  string,
  ZeroEntropyFilterOperator
>;

export type ZeroEntropyQueryFilter =
  | ZeroEntropyAttributeFilter
  | { $and: ZeroEntropyQueryFilter[] }
  | { $or: ZeroEntropyQueryFilter[] };

export type ZeroEntropyCollectionStatus = {
  numDocuments: number;
  numParsing: number;
  numIndexing: number;
  numIndexed: number;
  numFailed: number;
  numIndexedBytes: number;
};

export type ZeroEntropyFailedDocument = {
  path: string;
  error: string;
};

export interface IZeroEntropyClient {
  createCollection(collectionName: string): Promise<Result<void, AppError>>;
  deleteCollection(collectionName: string): Promise<Result<void, AppError>>;
  listCollections(): Promise<Result<string[], AppError>>;
  collectionExists(collectionName: string): Promise<Result<boolean, AppError>>;

  getStatus(
    collectionName: string,
  ): Promise<Result<ZeroEntropyCollectionStatus, AppError>>;

  addDocuments(args: {
    collectionName: string;
    documents: EntityToIndex[];
  }): Promise<
    Result<{ failedDocuments: ZeroEntropyFailedDocument[] }, AppError>
  >;

  deleteDocument(args: {
    collectionName: string;
    path: string;
  }): Promise<Result<{ deletedPaths: string[] }, AppError>>;

  getDocuments(args: {
    collectionName: string;
    pathPrefix?: string;
  }): Promise<Result<ZeroEntropyDocumentInfo[], AppError>>;

  queryTopSnippets(args: {
    collectionName: string;
    query: string;
    k: number;
    filter?: ZeroEntropyQueryFilter;
    reranker?: ZeroEntropyRerankerModel | null;
    preciseResponses?: boolean;
  }): Promise<Result<ZeroEntropySnippet[], AppError>>;

  queryTopDocuments(args: {
    collectionName: string;
    query: string;
    k: number;
    filter?: ZeroEntropyQueryFilter;
  }): Promise<Result<ZeroEntropyDocumentInfo[], AppError>>;
}
