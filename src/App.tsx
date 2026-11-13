/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { CustomizerProvider } from './context/CustomizerContext.tsx';
import { Header } from './components/Header.tsx';
import { PreviewStatusBanner } from './components/PreviewStatusBanner.tsx';
import { StagingRequestsPanel } from './components/StagingRequestsPanel.tsx';
import { LandingView } from './components/LandingView.tsx';
import { PortalView } from './components/PortalView.tsx';
import { StoreBuilderView } from './components/StoreBuilderView.tsx';
import { BillingSubscriptionView } from './components/BillingSubscriptionView.tsx';
import { AdminView } from './components/AdminView.tsx';
import { TemplateHubView } from './components/TemplateHubView.tsx';
import { FormationWizardModal } from './components/FormationWizardModal.tsx';
import { NewStoreModal } from './components/NewStoreModal.tsx';
import { AIChatModal } from './components/AIChatModal.tsx';
import { Footer } from './components/Footer.tsx';
import { CheckCircle } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { mode, toastMessage, showToast, language } = useApp();

  const [formationModalOpen, setFormationModalOpen] = useState(false);
  const [selectedStateCode, setSelectedStateCode] = useState<string>('WY');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const unavailable = () => showToast(language === 'ar'
    ? 'هذه الخدمة غير متاحة في المعاينة الحالية.'
    : 'This service is unavailable in the current preview.');
  const handleOpenFormationWithState = (_stateCode?: string) => unavailable();

  return (
    <div className="min-h-screen bg-[#F7FAFA] dark:bg-[#03131D] text-[#003E52] dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-[#00A896]/25 selection:text-[#003445] dark:selection:text-white">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white dark:bg-[#082030] border-2 border-[#00A896] text-[#003445] dark:text-white text-xs font-bold shadow-2xl animate-fade-in">
          <CheckCircle className="w-4 h-4 text-[#00A896] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <Header
        onOpenFormationModal={() => handleOpenFormationWithState()}
        onOpenStoreModal={unavailable}
      />

      {/* Visible, truthful release state for the showcase and dashboard */}
      <PreviewStatusBanner />

      <StagingRequestsPanel />

      {/* Main View Router */}
      <main className="flex-1">
        {mode === 'landing' && (
          <LandingView
            onOpenFormationModal={handleOpenFormationWithState}
            onOpenStoreModal={unavailable}
          />
        )}

        {mode === 'portal' && (
          <PortalView
            onOpenFormationModal={() => handleOpenFormationWithState()}
            onOpenStoreModal={unavailable}
          />
        )}

        {mode === 'store_builder' && (
          <StoreBuilderView
            onOpenStoreModal={unavailable}
          />
        )}

        {mode === 'billing' && (
          <BillingSubscriptionView />
        )}

        {mode === 'admin' && (
          <AdminView />
        )}

        {mode === 'template_hub' && (
          <TemplateHubView />
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Global Modals */}
      <FormationWizardModal
        isOpen={formationModalOpen}
        onClose={() => setFormationModalOpen(false)}
        initialStateCode={selectedStateCode}
      />

      <NewStoreModal
        isOpen={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
      />

      <AIChatModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
      />


    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <CustomizerProvider>
        <MainLayout />
      </CustomizerProvider>
    </AppProvider>
  );
}
