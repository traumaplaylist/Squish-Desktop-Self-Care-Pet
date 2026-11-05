import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './debug.css';
import { Debug } from './Debug';

createRoot(document.getElementById('root')!).render(<Debug />);
