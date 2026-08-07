import { createRoot } from 'react-dom/client';
import '@dbml-canvas/renderer/styles.css';
import './webview.css';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(<App />);
