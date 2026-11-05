import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { validateSettings } from './settingsSchema';

describe('validateSettings', () => {
  it('пустое/мусор → настройки по умолчанию', () => {
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings('мусор')).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings({ unknown: 1 })).toEqual(DEFAULT_SETTINGS);
  });
  it('частичный патч применяется поверх текущих', () => {
    const s = validateSettings({ breaks: { strictness: 'strict' }, lang: 'en' });
    expect(s.breaks.strictness).toBe('strict');
    expect(s.breaks.micro.intervalMin).toBe(20);
    expect(s.lang).toBe('en');
  });
  it('числа ограничиваются диапазоном, NaN — по умолчанию', () => {
    const s = validateSettings({
      breaks: { micro: { intervalMin: 1 }, overlayOpacity: 3 },
      water: { goalGlasses: Number.NaN },
    });
    expect(s.breaks.micro.intervalMin).toBe(5);
    expect(s.breaks.overlayOpacity).toBe(0.95);
    expect(s.water.goalGlasses).toBe(8);
  });
  it('неверные перечисления и типы отбрасываются', () => {
    const s = validateSettings({
      breaks: { strictness: 'brutal' },
      pet: { chatter: 42 },
      lang: 'de',
    });
    expect(s.breaks.strictness).toBe('normal');
    expect(s.pet.chatter).toBe('often');
    expect(s.lang).toBe('ru');
  });
  it('рабочие часы: неверное время и «через полночь» → по умолчанию; дни чистятся', () => {
    const s = validateSettings({
      smartPause: { workHours: { enabled: true, from: '22:00', to: '03:00', days: [5, 1, 1, 9] } },
    });
    expect(s.smartPause.workHours).toEqual({
      enabled: true,
      from: '09:00',
      to: '18:00',
      days: [1, 5],
    });
    expect(
      validateSettings({ smartPause: { workHours: { from: '25:00' } } }).smartPause.workHours.from,
    ).toBe('09:00');
  });
  it('исключения — только имена exe, без дублей', () => {
    const s = validateSettings({
      smartPause: { exceptionApps: ['zoom.exe', 'zoom.exe', 'rm -rf', ' obs64.exe '] },
    });
    expect(s.smartPause.exceptionApps).toEqual(['zoom.exe', 'obs64.exe']);
  });
  it('хоткеи: допустимый формат сохраняется, мусор — по умолчанию, пусто — выключить', () => {
    const s = validateSettings({
      hotkeys: { quickTask: 'Ctrl+Shift+K', water: 'банан', breakNow: '' },
    });
    expect(s.hotkeys.quickTask).toBe('Ctrl+Shift+K');
    expect(s.hotkeys.water).toBe('Ctrl+Alt+W');
    expect(s.hotkeys.breakNow).toBe('');
  });
  it('не мутирует исходные настройки', () => {
    const base = structuredClone(DEFAULT_SETTINGS);
    validateSettings({ breaks: { strictness: 'soft' } }, base);
    expect(base.breaks.strictness).toBe('normal');
  });
});
