import { DEBUG, DEBUG_API, IS_AIR_APP } from '../config';
import { AssertionError } from './assert';

export interface Log {
  message: string;
  args: any[];
  time: number; // Passing data from the worker to the application as a date object is not supported
  level: 'debug' | 'debugError';
  /** How many identical entries followed this one inside the fold window, see `addLog`. */
  repeats?: number;
}

const MAX_LOG_LENGTH = 999;
const logs: Log[] = [];

// Both the app and the worker keep their own buffer of this size, and a failure the UI retries on a timer
// repeats in whichever buffer it is raised in: a single stuck account reloads its activity history every ten
// seconds and fills 999 entries in under three hours, evicting the earlier lines that explain how it got stuck.
// Identical entries are therefore counted on the first of them instead of being appended, which keeps the count
// in the very entry the log export carries. Folding lives here, at the sink, so that it holds for every caller
// in both realms rather than for whichever call path was remembered.
const FOLD_WINDOW = 60000;
const FOLD_KEY_LIMIT = 256;
const foldAnchors = new Map<string, { entry: Log; time: number }>();

export function errorReplacer(_: string, value: any) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      metadata: value instanceof AssertionError ? value.metadata : undefined,
    };
  }
  return value;
}

export function addLog(log: Omit<Log, 'time' | 'repeats'>) {
  const time = Date.now();
  const args = log.args.map((arg) => JSON.stringify(arg, errorReplacer));
  const key = [log.level, log.message, ...log.args.map((arg, i) => toFoldSignature(arg, args[i]))].join('\u0000');
  const anchor = foldAnchors.get(key);

  // The anchor is known to point at an entry the buffer still holds: every append writes an anchor, so an entry
  // leaves the buffer only behind `MAX_LOG_LENGTH` appends, while the anchor it belongs to is dropped after
  // `FOLD_KEY_LIMIT` of them.
  if (anchor && time - anchor.time < FOLD_WINDOW) {
    anchor.entry.repeats = (anchor.entry.repeats ?? 0) + 1;
    return;
  }

  if (logs.length >= MAX_LOG_LENGTH) {
    logs.shift();
  }

  const entry: Log = { ...log, args, time };
  logs.push(entry);

  if (foldAnchors.size >= FOLD_KEY_LIMIT) {
    limitFoldAnchors(time);
  }

  // Re-inserted rather than overwritten, because a `Map` keeps a rewritten key in its original position and the
  // eviction below reads that order as age.
  foldAnchors.delete(key);
  foldAnchors.set(key, { entry, time });
}

/**
 * The stored entry keeps the stack, but the fold key cannot: the same failure raised from two places carries two
 * stacks and would never fold, which is precisely the repeating case this exists for.
 */
function toFoldSignature(arg: any, serialized: string) {
  return arg instanceof Error ? `${arg.name}: ${arg.message}` : serialized;
}

/**
 * Expired anchors go first, since they can no longer fold anything. A flood of distinct messages leaves none of
 * them expired, so the oldest are dropped after that to hold the cap, in insertion order, which `addLog` keeps
 * equal to age. Dropping the whole map instead would switch folding off for everyone exactly under the flood it
 * exists for.
 */
function limitFoldAnchors(now: number) {
  for (const [key, anchor] of foldAnchors) {
    if (now - anchor.time >= FOLD_WINDOW) {
      foldAnchors.delete(key);
    }
  }

  for (const key of foldAnchors.keys()) {
    if (foldAnchors.size < FOLD_KEY_LIMIT) break;
    foldAnchors.delete(key);
  }
}

export function getLogs() {
  return logs;
}

export function logDebugError(message: string, ...args: any[]) {
  addLog({ message, level: 'debugError', args });
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.error(`[DEBUG][${message}]`, ...args);
  }
  // The `androidApp` bridge is only injected into the Android Air WebView, so its presence is the platform check
  if (IS_AIR_APP && typeof window !== 'undefined') {
    (window as any).androidApp?.logDebugError(message, JSON.stringify(args, errorReplacer));
  }
}

export function logDebug(message: any, ...args: any[]) {
  addLog({ message, level: 'debug', args });
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

export function logDebugApi(message: any, obj1: any, obj2?: any) {
  if (DEBUG_API) {
    // eslint-disable-next-line no-console
    console.debug(`[DEBUG] ${message}`);
    // eslint-disable-next-line no-console
    if (obj1) console.dir(obj1);
    // eslint-disable-next-line no-console
    if (obj2) console.dir(obj2);
  }
}

export function logSelfXssWarnings() {
  const selfXssWarnings: AnyLiteral = {
    en: 'WARNING! This console can be a way for bad people to take over your crypto wallet through something called '
      + 'a Self-XSS attack. So, don\'t put in or paste code you don\'t understand. Stay safe!',
    ru: 'ВНИМАНИЕ! Через эту консоль злоумышленники могут захватить ваш криптовалютный кошелёк с помощью так '
      + 'называемой атаки Self-XSS. Поэтому не вводите и не вставляйте код, который вы не понимаете. Берегите себя!',
    es: '¡ADVERTENCIA! Esta consola puede ser una forma en que las personas malintencionadas se apoderen de su '
      + 'billetera de criptomonedas mediante un ataque llamado Self-XSS. Por lo tanto, '
      + 'no introduzca ni pegue código que no comprenda. ¡Cuídese!',
    zh: '警告！这个控制台可能成为坏人通过所谓的Self-XSS攻击来接管你的加密货币钱包的方式。因此，请不要输入或粘贴您不理解的代码。请保护自己！',
  };

  const langCode = navigator.language.split('-')[0];
  const text = selfXssWarnings[langCode] || selfXssWarnings.en;

  // eslint-disable-next-line no-console
  console.log('%c%s', 'color: red; background: yellow; font-size: 18px;', text);
}
