/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { Dashboard } from '../components/dashboard/dashboard';
import '../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Dashboard root is missing');
createRoot(root).render(
  <Dashboard initialData={null} staticDataUrl={`${import.meta.env.BASE_URL}data/market.json`} />,
);
