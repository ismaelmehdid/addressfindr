import * as v from 'valibot';

// Autumn's check() response carries more than this, but `allowed` is the only
// field the entitlement gate depends on. Validate it at the boundary.
export const AutumnCheckResultSchema = v.object({
  allowed: v.boolean(),
});
