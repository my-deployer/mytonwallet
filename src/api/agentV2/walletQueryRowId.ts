const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;
const FNV_SEEDS = [0xcbf29ce484222325n, 0x84222325cbf29ce4n] as const;

export function canonicalWalletQueryRowId(kind: string, sourceIdentity: string) {
  const prefix = safePrefix(kind);
  return `${prefix}_${stableToken(`${kind}\0${sourceIdentity}`)}`;
}

export function canonicalTransactionSourceRowId(accountRef: string, activityId: string) {
  return canonicalWalletQueryRowId('tx', `${accountRef}\0${activityId}`);
}

function stableToken(value: string) {
  const bytes = new TextEncoder().encode(value);
  return FNV_SEEDS.map((seed) => {
    let hash: bigint = seed;
    for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & UINT64_MASK;
    return hash.toString(16).padStart(16, '0');
  }).join('');
}

function safePrefix(value: string) {
  const safe = value.replace(/[^A-Za-z0-9._-]/gu, '').replace(/^[^A-Za-z0-9]+/u, '').slice(0, 24);
  return safe || 'row';
}
