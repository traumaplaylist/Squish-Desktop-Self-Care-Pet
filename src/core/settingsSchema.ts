/**
 * Проверка настроек (SPEC 2.4): всё, что пришло из окна настроек или из файла, приводится к
 * допустимым значениям. Недопустимое — заменяется значением по умолчанию, а не роняет приложение.
 */
import { parseTimeOfDay } from './day';
import { DEFAULT_SETTINGS } from './defaults';
import type { Settings, Weekday } from './types';

type Patch<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : Patch<T[K]>) : T[K];
};
export type SettingsPatch = Patch<Settings>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Глубокое слияние: только известные ключи, массивы заменяются целиком. */
function merge<T>(base: T, patch: unknown): T {
  if (!isObj(patch) || !isObj(base)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    if (!(k in patch)) continue;
    const b = (base as Record<string, unknown>)[k];
    const p = patch[k];
    if (isObj(b)) out[k] = merge(b, p);
    else if (Array.isArray(b)) out[k] = Array.isArray(p) ? p : b;
    else if (typeof p === typeof b) out[k] = p;
  }
  return out as T;
}

const num = (v: number, min: number, max: number, def: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : def;
const oneOf = <T>(v: T, allowed: readonly T[], def: T): T => (allowed.includes(v) ? v : def);
const time = (v: string, def: string) => (parseTimeOfDay(v) === null ? def : v);
const exeList = (v: string[]) =>
  [
    ...new Set(v.map((x) => String(x).trim()).filter((x) => /^[\w .()+-]{1,80}\.exe$/i.test(x))),
  ].slice(0, 50);
const ACCEL =
  /^((Ctrl|Control|Alt|Shift|Super|Cmd|CommandOrControl)\+){1,3}([A-Z0-9]|F\d{1,2}|Space|Escape|Up|Down|Left|Right)$/i;

export function validateSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = merge(structuredClone(base), raw);
  const d = DEFAULT_SETTINGS;
  const b = s.breaks;
  b.micro.intervalMin = num(b.micro.intervalMin, 5, 120, d.breaks.micro.intervalMin);
  b.micro.durationSec = num(b.micro.durationSec, 10, 120, d.breaks.micro.durationSec);
  b.long.intervalMin = num(b.long.intervalMin, 20, 240, d.breaks.long.intervalMin);
  b.long.durationMin = num(b.long.durationMin, 1, 30, d.breaks.long.durationMin);
  b.warningSec = num(b.warningSec, 5, 120, d.breaks.warningSec);
  b.strictness = oneOf(b.strictness, ['soft', 'normal', 'strict'] as const, d.breaks.strictness);
  b.overlayOpacity = num(b.overlayOpacity, 0.6, 0.95, d.breaks.overlayOpacity);
  b.background = oneOf(
    b.background,
    ['gradient1', 'gradient2', 'gradient3'] as const,
    d.breaks.background,
  );
  const sp = s.smartPause;
  sp.cooldownMin = oneOf(sp.cooldownMin, [1, 2, 5] as const, d.smartPause.cooldownMin);
  sp.exceptionApps = exeList(sp.exceptionApps);
  sp.ignoreMicApps = [
    ...new Set(sp.ignoreMicApps.map((x) => String(x).trim()).filter(Boolean)),
  ].slice(0, 50);
  const wh = sp.workHours;
  wh.from = time(wh.from, d.smartPause.workHours.from);
  wh.to = time(wh.to, d.smartPause.workHours.to);
  // R0: часы через полночь не поддерживаются — «до» должно быть позже «с».
  if ((parseTimeOfDay(wh.to) ?? 0) <= (parseTimeOfDay(wh.from) ?? 0)) {
    wh.from = d.smartPause.workHours.from;
    wh.to = d.smartPause.workHours.to;
  }
  wh.days = [
    ...new Set(wh.days.filter((x): x is Weekday => Number.isInteger(x) && x >= 0 && x <= 6)),
  ].sort();
  s.water.goalGlasses = num(s.water.goalGlasses, 1, 20, d.water.goalGlasses);
  s.water.glassMl = num(s.water.glassMl, 100, 1000, d.water.glassMl);
  s.water.remindAfterMin = num(s.water.remindAfterMin, 30, 300, d.water.remindAfterMin);
  s.tasks.defaultSize = oneOf(s.tasks.defaultSize, ['S', 'M', 'L'] as const, d.tasks.defaultSize);
  s.blinkPosture.intervalMin = num(s.blinkPosture.intervalMin, 10, 120, d.blinkPosture.intervalMin);
  s.pet.chatter = oneOf(s.pet.chatter, ['often', 'rare', 'off'] as const, d.pet.chatter);
  s.pet.volume = num(s.pet.volume, 0, 1, d.pet.volume);
  s.lang = oneOf(s.lang, ['ru', 'en'] as const, d.lang);
  for (const k of Object.keys(s.hotkeys) as (keyof Settings['hotkeys'])[]) {
    const v = String(s.hotkeys[k]).trim();
    s.hotkeys[k] = v === '' || ACCEL.test(v) ? v : d.hotkeys[k];
  }
  return s;
}
