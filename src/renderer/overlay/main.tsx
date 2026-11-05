import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './overlay.css';
import { Overlay } from './Overlay';

const primary = new URLSearchParams(location.search).get('primary') === '1';
createRoot(document.getElementById('root')!).render(<Overlay primary={primary} />);
