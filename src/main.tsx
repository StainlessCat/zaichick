import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyUiPreferences, loadUiPreferences } from './utils/uiPreferences';

applyUiPreferences(loadUiPreferences());

createRoot(document.getElementById('root')!).render(<App />);
