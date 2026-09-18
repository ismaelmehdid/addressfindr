import type { EntityToIndex, IndexableEntityType } from '../types';

export interface IEntitySerializer<T> {
  readonly entityType: IndexableEntityType;
  getEntityId(entity: T): string;
  toIndexable(entity: T, organizationId: string): EntityToIndex[];
}
