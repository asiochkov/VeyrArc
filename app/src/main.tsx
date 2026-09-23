import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { useLangStore } from './i18n';
import './styles/fonts';
import './styles/global.css';

document.documentElement.lang = useLangStore.getState().lang;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
