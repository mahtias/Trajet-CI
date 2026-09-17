import { createRoot } from 'react-dom/client';

import { registerSW } from 'virtual:pwa-register';
import { setBaseUrl } from '@workspace/api-client-react';
import App from './App';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

import './index.css';
setBaseUrl(import.meta.env.VITE_API_URL || null);
createRoot(document.getElementById('root')!).render(<App />);

const updateSW = registerSW({
  onNeedRefresh() {
    toast({
      title: 'Nouvelle version disponible',
      description: "Actualisez pour profiter des dernières mises à jour.",
      duration: 1000 * 60 * 10,
      action: (
        <ToastAction altText="Actualiser" onClick={() => updateSW(true)}>
          Actualiser
        </ToastAction>
      ),
    });
  },
});
