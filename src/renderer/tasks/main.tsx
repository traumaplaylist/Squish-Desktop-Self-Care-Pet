import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './tasks.css';
import { Tasks } from './Tasks';

createRoot(document.getElementById('root')!).render(<Tasks />);
