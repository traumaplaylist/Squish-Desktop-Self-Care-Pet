import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './widget.css';
import { Widget } from './Widget';

createRoot(document.getElementById('root')!).render(<Widget />);
