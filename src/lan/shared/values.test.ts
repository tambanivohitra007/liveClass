import { describe, expect, it } from 'vitest';
import { applySet, applyUpdate, runQuery, type DocEntry, type QuerySpec } from './values';

const docs: DocEntry[] = [
  { id: 'a', path: 'q/a', data: { quizId: 'x', order: 2, score: 10, createdAt: { __t: 3000 } } },
  { id: 'b', path: 'q/b', data: { quizId: 'x', order: 1, score: 30, createdAt: { __t: 1000 } } },
  { id: 'c', path: 'q/c', data: { quizId: 'y', order: 3, score: 20, createdAt: { __t: 2000 } } },
  { id: 'd', path: 'q/d', data: { quizId: 'x', score: 5 } },
];
const q = (patch: Partial<QuerySpec>): QuerySpec => ({ path: 'q', where: [], orderBy: [], ...patch });
const ids = (r: DocEntry[]) => r.map((d) => d.id);

describe('runQuery', () => {
  it('filters with == and in, orders and limits', () => {
    expect(ids(runQuery(docs, q({ where: [['quizId', '==', 'x']], orderBy: [['order', 'asc']] })))).toEqual(['b', 'a']);
    expect(ids(runQuery(docs, q({ where: [['quizId', 'in', ['y', 'z']]] })))).toEqual(['c']);
    expect(ids(runQuery(docs, q({ orderBy: [['score', 'desc']], limit: 2 })))).toEqual(['b', 'c']);
  });

  it('compares timestamps and excludes docs missing the inequality field', () => {
    expect(ids(runQuery(docs, q({ where: [['createdAt', '<', { __t: 2500 }]] })))).toEqual(['b', 'c']);
    expect(ids(runQuery(docs, q({ where: [['order', '!=', 2]] })))).toEqual(['b', 'c']);
  });

  it('supports startAfter cursors', () => {
    expect(ids(runQuery(docs, q({ orderBy: [['score', 'asc']], startAfter: [10] })))).toEqual(['c', 'b']);
  });
});

describe('writes', () => {
  it('resolves sentinels on set and merge', () => {
    const now = 42;
    const created = applySet(null, { n: { __fv: 'increment', n: 2 }, at: { __fv: 'serverTimestamp' }, tags: ['a'] }, false, now);
    expect(created).toEqual({ n: 2, at: { __t: 42 }, tags: ['a'] });
    const merged = applySet(created, { tags: { __fv: 'arrayUnion', v: ['a', 'b'] }, nested: { x: 1 } }, true, now);
    expect(merged).toEqual({ n: 2, at: { __t: 42 }, tags: ['a', 'b'], nested: { x: 1 } });
  });

  it('applies dotted field paths and deleteField on update', () => {
    const out = applyUpdate({ a: { b: 1, c: 2 }, gone: true }, { 'a.b': 5, gone: { __fv: 'delete' } }, 0);
    expect(out).toEqual({ a: { b: 5, c: 2 } });
  });
});
