import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import '../shared/page.css';
import { bindTheme } from '../shared/theme';
import { SettingsPage } from './Settings';

createRoot(document.getElementById('root')!).render(<SettingsPage />);
bindTheme();
