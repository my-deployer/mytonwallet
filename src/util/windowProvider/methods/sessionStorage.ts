export function sessionStorageGetItem(key: string) {
  return sessionStorage.getItem(key);
}

export function sessionStorageSetItem(key: string, value: string) {
  return sessionStorage.setItem(key, value);
}

export function sessionStorageRemoveItem(key: string) {
  return sessionStorage.removeItem(key);
}
