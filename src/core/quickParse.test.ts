import { describe, expect, it } from 'vitest';
import { parseQuickInput as p } from './quickParse';

describe('parseQuickInput', () => {
  it('просто название', () => {
    expect(p('купить хлеба')).toEqual({
      title: 'купить хлеба',
      size: 'S',
      recurrence: { kind: 'none' },
    });
  });
  it('размер по умолчанию из настроек', () => {
    expect(p('отчёт', 'M')?.size).toBe('M');
  });
  it('«!» в конце — большая', () => {
    expect(p('сдать отчёт!')).toMatchObject({ title: 'сдать отчёт', size: 'L' });
    expect(p('сдать отчёт !!! ')).toMatchObject({ title: 'сдать отчёт', size: 'L' });
  });
  it('«!» в середине — не размер', () => {
    expect(p('ура! позвонить маме')).toMatchObject({ title: 'ура! позвонить маме', size: 'S' });
  });
  it('каждый день / ежедневно / every day', () => {
    expect(p('зарядка каждый день')).toMatchObject({
      title: 'зарядка',
      recurrence: { kind: 'daily' },
    });
    expect(p('Ежедневно витамины')).toMatchObject({
      title: 'витамины',
      recurrence: { kind: 'daily' },
    });
    expect(p('stretch every day')).toMatchObject({
      title: 'stretch',
      recurrence: { kind: 'daily' },
    });
  });
  it('по будням', () => {
    expect(p('стендап по будням')).toMatchObject({
      title: 'стендап',
      recurrence: { kind: 'weekdays' },
    });
    expect(p('standup weekdays')).toMatchObject({
      title: 'standup',
      recurrence: { kind: 'weekdays' },
    });
  });
  it('по дням недели', () => {
    expect(p('бассейн по понедельникам и средам')).toMatchObject({
      title: 'бассейн',
      recurrence: { kind: 'days', days: [1, 3] },
    });
    expect(p('уборка каждую субботу')).toMatchObject({
      title: 'уборка',
      recurrence: { kind: 'days', days: [6] },
    });
    expect(p('gym on mon, wed and fri')).toMatchObject({
      title: 'gym',
      recurrence: { kind: 'days', days: [1, 3, 5] },
    });
  });
  it('«по» без дня недели — часть названия', () => {
    expect(p('погулять по парку')).toMatchObject({
      title: 'погулять по парку',
      recurrence: { kind: 'none' },
    });
  });
  it('в 15:00 — напоминание', () => {
    expect(p('позвонить врачу в 15:00')).toMatchObject({
      title: 'позвонить врачу',
      remindAt: '15:00',
    });
    expect(p('обед в 9.30')).toMatchObject({ title: 'обед', remindAt: '09:30' });
    expect(p('call mom at 18:45')).toMatchObject({ title: 'call mom', remindAt: '18:45' });
  });
  it('неверное время остаётся в названии', () => {
    expect(p('встреча в 25:99')).toMatchObject({ title: 'встреча в 25:99' });
    expect(p('встреча в 25:99')?.remindAt).toBeUndefined();
  });
  it('всё вместе в любом порядке', () => {
    expect(p('каждый день в 08:00 зарядка!')).toEqual({
      title: 'зарядка',
      size: 'L',
      recurrence: { kind: 'daily' },
      remindAt: '08:00',
    });
  });
  it('мусор → null', () => {
    for (const g of ['', '   ', '!!!', '...', ' — ', '\n\t', 'каждый день', 'в 15:00', '!?.,'])
      expect(p(g), g).toBeNull();
  });
  it('эмодзи и цифры в названии сохраняются', () => {
    expect(p('🚶 выйти на 10 минут')).toMatchObject({ title: '🚶 выйти на 10 минут' });
  });
  it('лишние пробелы и знаки по краям убираются', () => {
    expect(p('  ,  написать близкому ,  ')).toMatchObject({ title: 'написать близкому' });
  });
  it('очень длинный ввод обрезается до 200 символов', () => {
    expect(p('а'.repeat(500))?.title).toHaveLength(200);
  });
  it('регистр в ключевых словах не важен', () => {
    expect(p('Зарядка КАЖДЫЙ ДЕНЬ')).toMatchObject({
      title: 'Зарядка',
      recurrence: { kind: 'daily' },
    });
  });
});
