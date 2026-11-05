/** Светлая/тёмная тема окон по системной (nativeTheme → снапшот). */
export function bindTheme(): void {
  const apply = (t: 'light' | 'dark') => (document.documentElement.dataset['theme'] = t);
  void window.squish.invoke('app:getSnapshot').then((s) => apply(s.theme));
  window.squish.on('snapshot', (s) => apply(s.theme));
}
