export function transactionHashesEqual(left: string, right: string) {
  const canonicalLeft = canonicalHexTransactionHash(left);
  const canonicalRight = canonicalHexTransactionHash(right);
  return canonicalLeft !== undefined && canonicalRight !== undefined
    ? canonicalLeft === canonicalRight
    : left === right;
}

export function textContainsTransactionHash(text: string, hash: string) {
  const canonicalHash = canonicalHexTransactionHash(hash);
  return canonicalHash !== undefined
    ? text.toLocaleLowerCase('en-US').includes(canonicalHash)
    : text.includes(hash);
}

function canonicalHexTransactionHash(value: string) {
  const unprefixed = /^0x/iu.test(value) ? value.slice(2) : value;
  return /^[a-f0-9]{64}$/iu.test(unprefixed) ? unprefixed.toLocaleLowerCase('en-US') : undefined;
}
