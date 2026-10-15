import React, { useState, useEffect } from 'react';
import { SplashScreen } from './SplashScreen';
import { PancaHomeView } from './PancaHomeView';
import { PancaAIChatView } from './PancaAIChatView';
import { PancaMessagesView } from './PancaMessagesView';
import { PancaNotificationsView } from './PancaNotificationsView';
import { PancaDriveView } from './PancaDriveView';
import { 
  Bot, MessageSquare, Bell, HardDrive, ArrowLeft, ExternalLink, 
  Wifi, Battery, Signal, Home as HomeIcon
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
  onOpenDesktopCRM?: () => void;
  onLogout?: () => void;
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
  onOpenDesktopCRM,
  onLogout
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
      <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-0 sm:p-4">
        <SplashScreen
          onNext={handleNextFromSplash}
          onOpenWebCRM={navigateToDesktop}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-0 sm:p-4 font-sans select-none">
      {/* Mobile Screen Shell Frame */}
      <div className="relative w-full max-w-md h-screen sm:h-[844px] bg-slate-50 flex flex-col overflow-hidden sm:rounded-[40px] shadow-2xl border-0 sm:border-8 sm:border-slate-800">
        
        {/* Top Status Bar Simulation */}
        <div className="pt-3 px-6 pb-1 bg-white border-b border-slate-100 flex items-center justify-between text-slate-700 text-xs font-semibold shrink-0">
          <span className="tracking-tight font-bold">8:15</span>

          {/* Quick Switch to Desktop & PWA Install Button */}
          <div className="flex items-center gap-2">
            <PWAInstallButton variant="pill" className="!bg-violet-50 !text-violet-700 !border-violet-200" />
            <button
              onClick={navigateToDesktop}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-0.5 px-2 py-1 rounded-full bg-slate-100 transition active:scale-95"
              title="Buka Web CRM Utama"
            >
              <span>Web CRM</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
            <div className="flex items-center gap-1.5 text-slate-600 pl-1">
              <Signal className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Dynamic Screen Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {activeTab === 'home' && (
            <PancaHomeView
              currentUser={currentUser}
              unreadNotificationsCount={unreadNotifCount}
              onSelectPrompt={handleSelectPromptFromHome}
              onOpenNotifications={() => setActiveTab('notifikasi')}
              onOpenDriveUpload={handleOpenDriveUploadFromHome}
              onGoToAI={() => setActiveTab('ai')}
              onLogout={onLogout}
            />
          )}

          {activeTab === 'ai' && (
            <PancaAIChatView
              currentUser={currentUser}
              activeCompany={activeCompany}
              transactions={transactions}
              customers={customers}
              products={products}
              suppliers={suppliers}
              purchaseOrders={purchaseOrders}
              employees={employees}
              initialPrompt={pendingPromptForAI}
              onBack={() => {
                setPendingPromptForAI('');
                setActiveTab('home');
              }}
            />
          )}

          {activeTab === 'pesan' && (
            <PancaMessagesView currentUser={currentUser} />
          )}

          {activeTab === 'notifikasi' && (
            <PancaNotificationsView 
              currentUser={currentUser} 
              onCountChange={setUnreadNotifCount}
            />
          )}

          {activeTab === 'file' && (
            <PancaDriveView 
              currentUser={currentUser}
              openUploadOnMount={openUploadInDrive}
            />
          )}
        </div>

        {/* Bottom Navigation Bar (4 Menus requested: AI, Pesan, Notifikasi, File + Home button) */}
        <div className="shrink-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-3 py-2 z-30 flex items-center justify-around shadow-[0_-4px_15px_rgba(0,0,0,0.05)]">
          {/* Menu Home / Beranda */}
          <button
            onClick={() => {
              setPendingPromptForAI('');
              setActiveTab('home');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition active:scale-95 ${
              activeTab === 'home'
                ? 'text-violet-600 font-extrabold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1 rounded-xl ${activeTab === 'home' ? 'bg-violet-100' : ''}`}>
              <HomeIcon className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">Home</span>
          </button>

          {/* Menu 1: AI */}
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition active:scale-95 ${
              activeTab === 'ai'
                ? 'text-violet-600 font-extrabold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1 rounded-xl ${activeTab === 'ai' ? 'bg-violet-100' : ''}`}>
              <Bot className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">AI</span>
          </button>

          {/* Menu 2: Pesan */}
          <button
            onClick={() => setActiveTab('pesan')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition active:scale-95 ${
              activeTab === 'pesan'
                ? 'text-violet-600 font-extrabold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1 rounded-xl ${activeTab === 'pesan' ? 'bg-violet-100' : ''}`}>
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">Pesan</span>
          </button>

          {/* Menu 3: Notifikasi */}
          <button
            onClick={() => setActiveTab('notifikasi')}
            className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition active:scale-95 ${
              activeTab === 'notifikasi'
                ? 'text-violet-600 font-extrabold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1 rounded-xl ${activeTab === 'notifikasi' ? 'bg-violet-100' : ''}`}>
              <Bell className="w-5 h-5" />
            </div>
            {unreadNotifCount > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
            )}
            <span className="text-[10px] mt-0.5">Notifikasi</span>
          </button>

          {/* Menu 4: File (Drive) */}
          <button
            onClick={() => {
              setOpenUploadInDrive(false);
              setActiveTab('file');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition active:scale-95 ${
              activeTab === 'file'
                ? 'text-violet-600 font-extrabold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1 rounded-xl ${activeTab === 'file' ? 'bg-violet-100' : ''}`}>
              <HardDrive className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">File</span>
          </button>
        </div>
      </div>
    </div>
  );
};
