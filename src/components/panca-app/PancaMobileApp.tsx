import React, { useState, useEffect } from 'react';
import { SplashScreen } from './SplashScreen';
import { PancaHomeView } from './PancaHomeView';
import { PancaAIChatView } from './PancaAIChatView';
import { PancaMessagesView } from './PancaMessagesView';
import { PancaNotificationsView } from './PancaNotificationsView';
import { PancaDriveView } from './PancaDriveView';
import { 
  Bot, MessageSquare, Bell, HardDrive, ArrowLeft, Home as HomeIcon, LayoutGrid, Menu
} from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallButton';

export type PancaMobileTab = 'home' | 'ai' | 'pesan' | 'notifikasi' | 'file';

interface PancaMobileAppProps {
  currentUser?: {
    username: string;
    role: string;
    nama: string;
  } | null;
  activeCompany?: any;
  transactions?: any[];
  customers?: any[];
  products?: any[];
  suppliers?: any[];
  purchaseOrders?: any[];
  employees?: any[];
  appUsers?: any[];
  setCustomers?: React.Dispatch<React.SetStateAction<any[]>>;
  setTransactions?: React.Dispatch<React.SetStateAction<any[]>>;
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>;
  syncToSupabase?: (table: string, data: any) => void;
  onOpenDesktopCRM?: () => void;
  onLogout?: () => void;
  rolePermissions?: { id: string; canView: boolean; canEdit: boolean }[];
  qaQuestions?: any[];
  onOpenTaskApp?: () => void;
}

export const PancaMobileApp: React.FC<PancaMobileAppProps> = ({
  currentUser: propUser,
  activeCompany,
  transactions = [],
  customers = [],
  products = [],
  suppliers = [],
  purchaseOrders = [],
  employees = [],
  appUsers = [],
  setCustomers,
  setTransactions,
  setProducts,
  syncToSupabase,
  onOpenDesktopCRM,
  onLogout,
  rolePermissions = [],
  qaQuestions = [],
  onOpenTaskApp
}) => {
  // If no logged in user provided in props, use session or default to superadmin
  const currentUser = propUser || {
    username: 'superadmin',
    role: 'superadmin',
    nama: 'Adam (Panca Lead)'
  };

  // State: splash screen or main app
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    // Check if splash was dismissed in current session
    return sessionStorage.getItem('mypanca_splash_passed') !== 'true';
  });

  const [activeTab, setActiveTab] = useState<PancaMobileTab>('home');
  const [pendingPromptForAI, setPendingPromptForAI] = useState<string>('');
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(2);
  const [openUploadInDrive, setOpenUploadInDrive] = useState<boolean>(false);

  const handleNextFromSplash = () => {
    sessionStorage.setItem('mypanca_splash_passed', 'true');
    setShowSplash(false);
    setActiveTab('home');
  };

  const handleSelectPromptFromHome = (promptText: string) => {
    setPendingPromptForAI(promptText);
    setActiveTab('ai');
  };

  const handleOpenDriveUploadFromHome = () => {
    setOpenUploadInDrive(true);
    setActiveTab('file');
  };

  const navigateToDesktop = () => {
    if (onOpenDesktopCRM) {
      onOpenDesktopCRM();
    } else {
      window.location.href = '/';
    }
  };

  // Render Splash Screen if active
  if (showSplash) {
    return (
      <div className="min-h-screen w-full bg-slate-900 dark:bg-zinc-950 flex items-center justify-center p-0 sm:p-4">
        <SplashScreen
          onNext={handleNextFromSplash}
          onOpenWebCRM={navigateToDesktop}
        />
      </div>
    );
  }

  const renderHeader = (title: string, subtitle: string, onBackClick: () => void) => (
    <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs shrink-0 z-10">
      <div className="flex items-center gap-2.5">
        <button onClick={onBackClick} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95"><ArrowLeft className="w-4 h-4" /></button>
        <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-extrabold text-xs shadow-xs">P</div>
        <div>
          <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 leading-tight">{title}</h3>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-slate-900 dark:bg-zinc-950 flex items-center justify-center p-0 sm:p-4 font-sans select-none">
      {/* Mobile Screen Shell Frame */}
      <div className="relative w-full max-w-md h-screen sm:h-[844px] bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 flex flex-col overflow-hidden sm:rounded-[40px] shadow-2xl border-0 sm:border-8 sm:border-slate-800 dark:sm:border-zinc-800">
        {/* Dynamic Screen Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {activeTab === 'home' && (
            <PancaHomeView
              currentUser={currentUser}
              unreadNotificationsCount={unreadNotifCount}
              transactions={transactions}
              customers={customers}
              products={products}
              suppliers={suppliers}
              purchaseOrders={purchaseOrders}
              rolePermissions={rolePermissions}
              onSelectPrompt={handleSelectPromptFromHome}
              onOpenNotifications={() => setActiveTab('notifikasi')}
              onOpenDriveUpload={handleOpenDriveUploadFromHome}
              onGoToAI={() => setActiveTab('ai')}
              onLogout={onLogout}
            />
          )}

          {activeTab === 'ai' && (
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
              <PancaAIChatView
                currentUser={currentUser}
                activeCompany={activeCompany}
                transactions={transactions}
                customers={customers}
                products={products}
                suppliers={suppliers}
                purchaseOrders={purchaseOrders}
                employees={employees}
                appUsers={appUsers}
                setCustomers={setCustomers}
                setTransactions={setTransactions}
                setProducts={setProducts}
                syncToSupabase={syncToSupabase}
                initialPrompt={pendingPromptForAI}
                rolePermissions={rolePermissions}
                qaQuestions={qaQuestions}
                onBack={() => {
                  setPendingPromptForAI('');
                  setActiveTab('home');
                }}
              />
            </div>
          )}

          {activeTab === 'pesan' && (
            <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950">
              {renderHeader("Panca Pesan Tim", "Diskusi & Koordinasi Operasional", () => setActiveTab('home'))}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PancaMessagesView currentUser={currentUser} />
              </div>
            </div>
          )}

          {activeTab === 'notifikasi' && (
            <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950">
              {renderHeader("Notifikasi Sistem", "Alert & Pemberitahuan", () => setActiveTab('home'))}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PancaNotificationsView 
                  currentUser={currentUser} 
                  onCountChange={setUnreadNotifCount}
                />
              </div>
            </div>
          )}

          {activeTab === 'file' && (
            <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950">
              {renderHeader("Panca Drive Arsip", "Dokumen & Lampiran Perusahaan", () => setActiveTab('home'))}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PancaDriveView 
                  currentUser={currentUser}
                  openUploadOnMount={openUploadInDrive}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Bar (Matching Mockup) */}
        {activeTab === 'home' && (
          <div className="shrink-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-zinc-800 px-4 py-2 z-30 flex items-center justify-around shadow-[0_-4px_15px_rgba(0,0,0,0.03)]">
            {/* 1. Beranda */}
            <button
              onClick={() => {
                setPendingPromptForAI('');
                setActiveTab('home');
              }}
              className="flex flex-col items-center justify-center py-1 px-3 transition active:scale-95 text-slate-900 dark:text-white font-bold"
            >
              <div className="p-1 rounded-xl">
                <HomeIcon className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="text-[10px] font-extrabold mt-0.5">Beranda</span>
            </button>

            {/* 2. Chat */}
            <button
              onClick={() => setActiveTab('ai')}
              className="flex flex-col items-center justify-center py-1 px-3 transition active:scale-95 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
            >
              <div className="p-1 rounded-xl">
                <MessageSquare className="w-5 h-5 stroke-[1.8]" />
              </div>
              <span className="text-[10px] font-semibold mt-0.5">Chat</span>
            </button>

            {/* 3. Tools */}
            <button
              onClick={() => {
                setOpenUploadInDrive(false);
                setActiveTab('file');
              }}
              className="flex flex-col items-center justify-center py-1 px-3 transition active:scale-95 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
            >
              <div className="p-1 rounded-xl">
                <LayoutGrid className="w-5 h-5 stroke-[1.8]" />
              </div>
              <span className="text-[10px] font-semibold mt-0.5">Tools</span>
            </button>

            {/* 4. Lainnya */}
            <button
              onClick={() => setActiveTab('notifikasi')}
              className="relative flex flex-col items-center justify-center py-1 px-3 transition active:scale-95 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
            >
              <div className="p-1 rounded-xl">
                <Menu className="w-5 h-5 stroke-[1.8]" />
              </div>
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-3 w-2 h-2 bg-rose-500 rounded-full" />
              )}
              <span className="text-[10px] font-semibold mt-0.5">Lainnya</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
