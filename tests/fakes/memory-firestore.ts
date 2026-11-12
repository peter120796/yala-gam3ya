/**
 * In-memory stand-in for the subset of the Firestore Admin API this app uses
 * (collections, sub-collections, collection groups, where/orderBy/limit/offset,
 * count(), transactions, batches, bulkWriter, create-if-absent semantics).
 *
 * It exists because the Firestore emulator can't be downloaded in the CI
 * workspace. The same integration tests also run against the real emulator
 * (`npm run test:emulator`) — keep app code within this subset.
 */
type Data = Record<string, unknown>;
type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "array-contains" | "array-contains-any" | "in";

const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));
let autoId = 0;
const newId = () => `auto${(++autoId).toString(36).padStart(8, "0")}`;

class AlreadyExists extends Error {
  code = 6;
  constructor(path: string) {
    super(`6 ALREADY_EXISTS: ${path}`);
  }
}
class NotFound extends Error {
  code = 5;
  constructor(path: string) {
    super(`5 NOT_FOUND: ${path}`);
  }
}

function deepMerge(target: Data, src: Data): Data {
  const out: Data = { ...target };
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Data, v as Data);
    } else out[k] = clone(v);
  }
  return out;
}
const strip = (d: Data): Data => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
const getField = (d: Data, f: string): unknown => f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), d);
const cmp = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
};

export class MemoryFirestore {
  store = new Map<string, Data>();

  collection(path: string) {
    return new CollectionRef(this, path);
  }
  doc(path: string) {
    const parts = path.split("/");
    return new DocRef(this, parts.slice(0, -1).join("/"), parts.at(-1)!);
  }
  collectionGroup(name: string) {
    return new Query(this, { group: name });
  }
  async getAll(...refs: DocRef[]) {
    // Real Firestore rejects an empty getAll(); mirror that so tests catch it.
    if (!refs.length) throw new Error('Function "Firestore.getAll()" requires at least 1 argument.');
    return refs.map((r) => r.snap());
  }
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = new Transaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }
  batch() {
    return new Batch(this);
  }
  bulkWriter() {
    return new BulkWriter(this);
  }
  settings() {}
}

class DocSnapshot {
  constructor(
    readonly ref: DocRef,
    private readonly d: Data | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  get exists() {
    return this.d !== undefined;
  }
  data() {
    return this.d === undefined ? undefined : clone(this.d);
  }
  get(field: string) {
    return this.d ? getField(this.d, field) : undefined;
  }
}

class DocRef {
  constructor(
    readonly fs: MemoryFirestore,
    readonly parentPath: string,
    readonly id: string,
  ) {}
  get path() {
    return `${this.parentPath}/${this.id}`;
  }
  get parent() {
    return new CollectionRef(this.fs, this.parentPath);
  }
  collection(name: string) {
    return new CollectionRef(this.fs, `${this.path}/${name}`);
  }
  snap() {
    return new DocSnapshot(this, this.fs.store.get(this.path));
  }
  async get() {
    return this.snap();
  }
  applySet(data: Data, opts?: { merge?: boolean }) {
    const cur = this.fs.store.get(this.path);
    this.fs.store.set(this.path, opts?.merge && cur ? deepMerge(cur, data) : strip(clone(data)));
  }
  applyUpdate(data: Data) {
    const cur = this.fs.store.get(this.path);
    if (!cur) throw new NotFound(this.path);
    const next = { ...cur };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) next[k] = clone(v);
    this.fs.store.set(this.path, next);
  }
  applyCreate(data: Data) {
    if (this.fs.store.has(this.path)) throw new AlreadyExists(this.path);
    this.fs.store.set(this.path, strip(clone(data)));
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    this.applySet(data, opts);
  }
  async update(data: Data) {
    this.applyUpdate(data);
  }
  async create(data: Data) {
    this.applyCreate(data);
  }
  async delete() {
    this.fs.store.delete(this.path);
  }
}

interface QState {
  coll?: string;
  group?: string;
  filters: { f: string; op: Op; v: unknown }[];
  order: { f: string; dir: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

class Query {
  protected readonly s: QState;
  constructor(
    protected readonly fs: MemoryFirestore,
    s: Partial<QState>,
  ) {
    this.s = { filters: [], order: [], ...s };
  }
  private with(p: Partial<QState>) {
    return new Query(this.fs, { ...this.s, ...p, filters: p.filters ?? this.s.filters, order: p.order ?? this.s.order });
  }
  where(f: string, op: Op, v: unknown) {
    return this.with({ filters: [...this.s.filters, { f, op, v }] });
  }
  orderBy(f: string, dir: "asc" | "desc" = "asc") {
    return this.with({ order: [...this.s.order, { f, dir }] });
  }
  limit(n: number) {
    return this.with({ limit: n });
  }
  offset(n: number) {
    return this.with({ offset: n });
  }
  select() {
    return this;
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this.run().length }) }) };
  }
  run(): DocSnapshot[] {
    const out: DocSnapshot[] = [];
    for (const [path, d] of this.fs.store) {
      const parts = path.split("/");
      const parent = parts.slice(0, -1).join("/");
      if (this.s.coll !== undefined && parent !== this.s.coll) continue;
      if (this.s.group !== undefined && parts.at(-2) !== this.s.group) continue;
      const ok = this.s.filters.every(({ f, op, v }) => {
        const x = getField(d, f);
        switch (op) {
          case "==": return (x ?? null) === v || (Array.isArray(v) && JSON.stringify(x) === JSON.stringify(v));
          case "!=": return x !== undefined && x !== v;
          case "<": return x !== undefined && x !== null && cmp(x, v) < 0;
          case "<=": return x !== undefined && x !== null && cmp(x, v) <= 0;
          case ">": return x !== undefined && x !== null && cmp(x, v) > 0;
          case ">=": return x !== undefined && x !== null && cmp(x, v) >= 0;
          case "array-contains": return Array.isArray(x) && x.includes(v);
          case "array-contains-any": return Array.isArray(x) && (v as unknown[]).some((y) => x.includes(y));
          case "in": return (v as unknown[]).includes(x);
        }
      });
      if (ok) out.push(new DocSnapshot(new DocRef(this.fs, parent, parts.at(-1)!), clone(d)));
    }
    const order = this.s.order.length ? this.s.order : [{ f: "__id", dir: "asc" as const }];
    out.sort((a, b) => {
      for (const { f, dir } of order) {
        const c = f === "__id" ? cmp(a.ref.path, b.ref.path) : cmp(a.get(f), b.get(f));
        if (c) return dir === "asc" ? c : -c;
      }
      return cmp(a.ref.path, b.ref.path);
    });
    return out.slice(this.s.offset ?? 0, this.s.limit !== undefined ? (this.s.offset ?? 0) + this.s.limit : undefined);
  }
  async get() {
    const docs = this.run();
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb: (d: DocSnapshot) => void) => docs.forEach(cb) };
  }
}

class CollectionRef extends Query {
  constructor(
    fs: MemoryFirestore,
    readonly path: string,
  ) {
    super(fs, { coll: path });
  }
  get id() {
    return this.path.split("/").at(-1)!;
  }
  get parent() {
    const parts = this.path.split("/");
    return parts.length < 2 ? null : new DocRef(this.fs, parts.slice(0, -2).join("/"), parts.at(-2)!);
  }
  doc(id?: string) {
    return new DocRef(this.fs, this.path, id ?? newId());
  }
  async add(data: Data) {
    const ref = this.doc();
    ref.applyCreate(data);
    return ref;
  }
}

type Write = () => void;

class Transaction {
  private writes: Write[] = [];
  constructor(private readonly fs: MemoryFirestore) {}
  async get(target: DocRef | Query) {
    if (target instanceof DocRef) return target.snap();
    return target.get();
  }
  async getAll(...refs: DocRef[]) {
    // Real Firestore rejects an empty getAll(); mirror that so tests catch it.
    if (!refs.length) throw new Error('Function "Firestore.getAll()" requires at least 1 argument.');
    return refs.map((r) => r.snap());
  }
  set(ref: DocRef, data: Data, opts?: { merge?: boolean }) {
    this.writes.push(() => ref.applySet(data, opts));
    return this;
  }
  update(ref: DocRef, data: Data) {
    this.writes.push(() => ref.applyUpdate(data));
    return this;
  }
  create(ref: DocRef, data: Data) {
    this.writes.push(() => ref.applyCreate(data));
    return this;
  }
  delete(ref: DocRef) {
    this.writes.push(() => void this.fs.store.delete(ref.path));
    return this;
  }
  commit() {
    // All-or-nothing: snapshot, apply, roll back on error.
    const backup = new Map(this.fs.store);
    try {
      for (const w of this.writes) w();
    } catch (e) {
      this.fs.store = backup;
      throw e;
    }
  }
}

class Batch extends Transaction {
  async commit() {
    super.commit();
  }
}

class BulkWriter {
  private onError: ((e: { code: number }) => boolean) | null = null;
  constructor(private readonly fs: MemoryFirestore) {}
  private run(w: () => void) {
    try {
      w();
    } catch (e) {
      if (!this.onError || !this.onError(e as { code: number })) {
        // swallowed as a failed write (like BulkWriter after retries)
      }
    }
    return Promise.resolve();
  }
  onWriteError(cb: (e: { code: number }) => boolean) {
    this.onError = cb;
  }
  create(ref: DocRef, d: Data) {
    return this.run(() => ref.applyCreate(d));
  }
  set(ref: DocRef, d: Data, o?: { merge?: boolean }) {
    return this.run(() => ref.applySet(d, o));
  }
  update(ref: DocRef, d: Data) {
    return this.run(() => ref.applyUpdate(d));
  }
  delete(ref: DocRef) {
    return this.run(() => void this.fs.store.delete(ref.path));
  }
  async close() {}
  async flush() {}
}
