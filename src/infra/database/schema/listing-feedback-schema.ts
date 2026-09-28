import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// why: the values mirror FEEDBACK_VERDICTS and FEEDBACK_REASONS in
// core/listing/feedback.ts; a schema file may not import a domain module.
// The repository test pins both lists to the core ones.
export const listingFeedbackVerdict = pgEnum('listing_feedback_verdict', [
  'confirmed',
  'none_match',
]);

export const listingFeedbackReason = pgEnum('listing_feedback_reason', [
  'wrong_commune',
  'wrong_dwellings',
  'address_missing',
  'unsure',
]);

export const listingFeedback = pgTable(
  'listing_feedback',
  {
    id: uuid().defaultRandom().primaryKey(),
    searchId: uuid().notNull(),
    listingUrl: text().notNull(),
    verdict: listingFeedbackVerdict().notNull(),
    confirmedDpeNumber: text(),
    reason: listingFeedbackReason(),
    comment: text(),
    candidates: jsonb()
      .$type<{ dpeNumber: string; score: number }[]>()
      .notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('listing_feedback_search_id_unique').on(table.searchId),
    check(
      'listing_feedback_confirmed_dpe_number_check',
      sql`(${table.verdict} = 'confirmed') = (${table.confirmedDpeNumber} is not null)`,
    ),
    check(
      'listing_feedback_detail_check',
      sql`${table.verdict} = 'none_match' or (${table.reason} is null and ${table.comment} is null)`,
    ),
    check(
      'listing_feedback_comment_length_check',
      sql`char_length(${table.comment}) <= 1000`,
    ),
  ],
).enableRLS();
