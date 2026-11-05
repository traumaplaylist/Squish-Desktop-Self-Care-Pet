import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import { bindTheme } from '../shared/theme';
import './tasks.css';
import { Tasks } from './Tasks';

createRoot(document.getElementById('root')!).render(<Tasks />);
bindTheme();
