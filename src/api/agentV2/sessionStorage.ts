import { callWindow } from '../../util/windowProvider/connector';

export interface AgentV2SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const storage: AgentV2SessionStorage = typeof sessionStorage === 'object' ? {
  getItem(key) {
    return Promise.resolve(sessionStorage.getItem(key));
  },
  setItem(key, value) {
    sessionStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem(key) {
    sessionStorage.removeItem(key);
    return Promise.resolve();
  },
} : {
  getItem(key) {
    return callWindow('sessionStorageGetItem', key);
  },
  setItem(key, value) {
    return callWindow('sessionStorageSetItem', key, value);
  },
  removeItem(key) {
    return callWindow('sessionStorageRemoveItem', key);
  },
};

export default storage;
