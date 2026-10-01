import { describe, expect, it } from 'vitest';
import {
  RESULT_LABELS,
  RESULT_MESSAGE_MAX,
  RESULT_STATUSES,
  SEND_CHUNK_SIZE,
  isResultStatus,
} from '@/lib/deliberation';

describe('lib/deliberation', () => {
  it.each(RESULT_STATUSES)('isResultStatus accepte « %s »', (status) => {
    expect(isResultStatus(status)).toBe(true);
  });

  it.each([['pending'], ['ACCEPTED'], [''], [undefined], [null], [1], [{}]])('isResultStatus refuse %j', (v) => {
    expect(isResultStatus(v)).toBe(false);
  });

  it('chaque statut a un libellé', () => {
    for (const status of RESULT_STATUSES) expect(RESULT_LABELS[status]).toBeTruthy();
  });

  it('expose des limites raisonnables', () => {
    expect(RESULT_MESSAGE_MAX).toBeGreaterThan(0);
    expect(SEND_CHUNK_SIZE).toBeGreaterThan(0);
    expect(SEND_CHUNK_SIZE).toBeLessThanOrEqual(20); // un lot d'e-mails doit tenir dans maxDuration = 60 s
  });
});
