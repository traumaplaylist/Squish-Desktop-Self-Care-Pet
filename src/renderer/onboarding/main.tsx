import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import '../shared/page.css';
import './onboarding.css';
import { bindTheme } from '../shared/theme';
import { Onboarding } from './Onboarding';

createRoot(document.getElementById('root')!).render(<Onboarding />);
bindTheme();
