import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import '../shared/page.css';
import './home.css';
import { bindTheme } from '../shared/theme';
import { Home } from './Home';

createRoot(document.getElementById('root')!).render(<Home />);
bindTheme();
