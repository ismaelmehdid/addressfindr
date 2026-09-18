import { toStandardJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';

export const WorkingMemorySchema = v.object({
  userNotes: v.optional(
    v.pipe(
      v.string(),
      v.maxLength(2000),
      v.description(
        'Free-form notes about the user that should survive across turns: stated preferences (language, vocabulary, units), durable context (company name, project names, recurring topics), explicit user-asked reminders. Keep concise. Do not store sensitive PII (emails, phones, ids) here.',
      ),
    ),
  ),
});

export const WorkingMemoryJsonSchema =
  toStandardJsonSchema(WorkingMemorySchema);
