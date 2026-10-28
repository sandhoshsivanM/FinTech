// The app's one Linker, wired to the gateway, the account's data key, the
// encrypted record store and the shared entity store.
import { gateway } from '../api';
import { keys } from '../account';
import { records } from '../vault';
import { saveRecords, syncNow, useAppStore } from '../store';
import { AaClient } from './api';
import { ensureDeliveryKey, loadDeliveryKeys } from './deliveryKeys';
import { Linker } from './link';

let instance: Linker | undefined;

export function linker(): Linker {
  if (instance) return instance;
  const dek = () => keys().dataKey;
  const keyDeps = { dek, records, save: saveRecords, sync: syncNow };
  instance = new Linker({
    aa: new AaClient(gateway()),
    ring: () => loadDeliveryKeys(keyDeps),
    ensureKey: () => ensureDeliveryKey(keyDeps),
    state: () => {
      const s = useAppStore.getState();
      return { ...s, profileId: s.activeProfileId, now: Date.now() };
    },
    dek,
    records,
    save: saveRecords,
  });
  return instance;
}
