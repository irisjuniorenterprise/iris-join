// tests/helpers/fake-db.ts
//
// Faux Firestore minimal pour les tests de routes : chaque collection
// renvoie toujours le même contenu, quels que soient where/select/limit.
// Suffisant pour vérifier la logique des routes ; le VRAI comportement de
// Firestore (transactions, concurrence) est couvert par tests/integration.
import { vi } from 'vitest';

type Row = Record<string, unknown>;

export function snapshot(rows: Row[]) {
  return {
    empty: rows.length === 0,
    size: rows.length,
    docs: rows.map((data, i) => ({
      id: typeof data.id === 'string' ? data.id : `doc${i}`,
      data: () => data,
    })),
  };
}

export function createFakeDb(collections: Record<string, Row[]> = {}) {
  const add = vi.fn(async (_data: Row) => ({ id: 'new-doc' }));
  const query = (name: string) => {
    const q: Record<string, unknown> = {};
    q.where = () => q;
    q.select = () => q;
    q.limit = () => q;
    q.get = async () => snapshot(collections[name] ?? []);
    q.add = add;
    return q;
  };
  return { db: { collection: (name: string) => query(name) }, add };
}
