export type ActiveContextRef = { kind: 'storage-file'; id: string };

type ToolEntity = { kind: ActiveContextRef['kind']; field: string };

const TOOL_ENTITY: Record<string, ToolEntity> = {
  searchFileText: { kind: 'storage-file', field: 'fileId' },
};

export function toolActiveContext(
  toolName: string,
  input: unknown,
): ActiveContextRef | null {
  const entity = TOOL_ENTITY[toolName];
  if (!entity) return null;
  if (input === null || typeof input !== 'object') return null;
  const id = (input as Record<string, unknown>)[entity.field];
  if (typeof id !== 'string' || id.length === 0) return null;
  return { kind: entity.kind, id };
}
