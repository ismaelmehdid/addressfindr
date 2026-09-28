'use client';

import { useRef, useState } from 'react';
import * as v from 'valibot';
import {
  FeedbackDetailReceiptSchema,
  FeedbackReceiptSchema,
} from '@/application/listing/feedback-dto';
import {
  type FeedbackCandidate,
  type FeedbackReason,
  type FeedbackVerdict,
  toFeedbackCandidates,
} from '@/core/listing/feedback';

type SendStatus = 'idle' | 'sending' | 'failed';

type VerdictAttempt =
  | { kind: 'confirmed'; dpeNumber: string }
  | { kind: 'none_match' };

export type SearchFeedback = {
  verdict:
    | { kind: 'none' }
    | { kind: 'confirmed'; dpeNumber: string }
    | { kind: 'none_match'; detailSent: boolean };
  verdictStatus: SendStatus;
  verdictFailure: VerdictAttempt | null;
  detailStatus: SendStatus;
  confirm: (dpeNumber: string) => void;
  reportNoneMatch: () => void;
  sendDetail: (detail: {
    reason: FeedbackReason | null;
    comment: string;
  }) => void;
};

type ShownCandidate = {
  record: { dpeNumber: string };
  confidence: number;
};

// why: randomUUID only exists in secure contexts, so testing the app from
// another device of the LAN over plain http needs the getRandomValues path.
export function createSearchId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto
    .getRandomValues(new Uint8Array(16))
    .map((byte, index) => {
      if (index === 6) return (byte & 0x0f) | 0x40;
      if (index === 8) return (byte & 0x3f) | 0x80;
      return byte;
    });
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function postForBody(path: string, payload: object): Promise<unknown> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function sendVerdict(payload: {
  searchId: string;
  listingUrl: string;
  verdict: FeedbackVerdict;
  confirmedDpeNumber: string | null;
  candidates: FeedbackCandidate[];
}): Promise<boolean> {
  const body = await postForBody('/api/listings/feedback', payload);
  const receipt = v.safeParse(FeedbackReceiptSchema, body);
  return (
    receipt.success &&
    receipt.output.searchId === payload.searchId &&
    receipt.output.verdict === payload.verdict
  );
}

export async function sendDetailRequest(payload: {
  searchId: string;
  reason: FeedbackReason | null;
  comment: string;
}): Promise<boolean> {
  const body = await postForBody('/api/listings/feedback/detail', payload);
  const receipt = v.safeParse(FeedbackDetailReceiptSchema, body);
  return receipt.success && receipt.output.searchId === payload.searchId;
}

// why: the results workspace remounts for every displayed result, so one
// mount is one search: its id is drawn once and the verdict lives in memory.
export function useSearchFeedback(input: {
  listingUrl: string;
  candidates: readonly ShownCandidate[];
}): SearchFeedback {
  const [searchId] = useState(createSearchId);
  const [verdict, setVerdict] = useState<SearchFeedback['verdict']>({
    kind: 'none',
  });
  const [verdictStatus, setVerdictStatus] = useState<SendStatus>('idle');
  const [verdictFailure, setVerdictFailure] = useState<VerdictAttempt | null>(
    null,
  );
  const [detailStatus, setDetailStatus] = useState<SendStatus>('idle');
  // why: a double click fires twice before React re-renders the disabled
  // button; the refs close that window.
  const verdictInFlight = useRef(false);
  const detailInFlight = useRef(false);

  function submitVerdict(attempt: VerdictAttempt): void {
    if (verdict.kind !== 'none' || verdictInFlight.current) return;
    verdictInFlight.current = true;
    setVerdictStatus('sending');
    setVerdictFailure(null);
    void sendVerdict({
      searchId,
      listingUrl: input.listingUrl,
      verdict: attempt.kind,
      confirmedDpeNumber:
        attempt.kind === 'confirmed' ? attempt.dpeNumber : null,
      candidates: toFeedbackCandidates(input.candidates),
    }).then((saved) => {
      verdictInFlight.current = false;
      if (!saved) {
        setVerdictStatus('failed');
        setVerdictFailure(attempt);
        return;
      }
      setVerdictStatus('idle');
      setVerdict(
        attempt.kind === 'confirmed'
          ? { kind: 'confirmed', dpeNumber: attempt.dpeNumber }
          : { kind: 'none_match', detailSent: false },
      );
    });
  }

  function sendDetail(detail: {
    reason: FeedbackReason | null;
    comment: string;
  }): void {
    if (
      verdict.kind !== 'none_match' ||
      verdict.detailSent ||
      detailInFlight.current
    ) {
      return;
    }
    detailInFlight.current = true;
    setDetailStatus('sending');
    void sendDetailRequest({
      searchId,
      reason: detail.reason,
      comment: detail.comment.trim(),
    }).then((saved) => {
      detailInFlight.current = false;
      if (!saved) {
        setDetailStatus('failed');
        return;
      }
      setDetailStatus('idle');
      setVerdict({ kind: 'none_match', detailSent: true });
    });
  }

  function confirm(dpeNumber: string): void {
    submitVerdict({ kind: 'confirmed', dpeNumber });
  }

  function reportNoneMatch(): void {
    submitVerdict({ kind: 'none_match' });
  }

  return {
    verdict,
    verdictStatus,
    verdictFailure,
    detailStatus,
    confirm,
    reportNoneMatch,
    sendDetail,
  };
}
