import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, X, CheckCircle, Sparkles } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'banner' | 'button' | 'pill';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'button', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already running inside installed standalone PWA, don't show
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        setJustInstalled(true);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // Fallback for browsers that don't trigger beforeinstallprompt (e.g. Firefox or desktop chrome that hasn't fired yet)
      setShowIOSGuide(true);
    }
  };

  if (variant === 'banner') {
    return (
      <>
        <div className={`bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-3.5 rounded-2xl shadow-lg flex items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold leading-tight truncate">Pasang Aplikasi Panca AI</h4>
              <p className="text-[11px] text-violet-100 opacity-90 truncate">Akses cepat & offline langsung dari layar HP</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 bg-white text-violet-700 text-xs font-bold rounded-xl shadow-md hover:bg-violet-50 transition active:scale-95 shrink-0"
          >
            Install
          </button>
        </div>

        {/* Modal Guide */}
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative text-slate-800">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6" />
              </div>

              <h3 className="text-base font-bold text-slate-900">Cara Pasang Panca AI di HP</h3>
              <p className="mt-1 text-xs text-slate-500">
                Aplikasi ini mendukung Progressive Web App (PWA). Ikuti langkah mudah berikut:
              </p>

              <div className="mt-4 space-y-3 bg-violet-50/70 p-3.5 rounded-2xl border border-violet-100/80 text-xs">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  <span>Di browser (Chrome / Safari), ketuk menu <strong>Bagikan (Share)</strong> atau tombol titik tiga (⋮).</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  <span>Pilih <strong>"Tambahkan ke Layar Utama" (Add to Home Screen)</strong> atau <strong>"Install App"</strong>.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  <span>Buka icon <strong>Panca AI</strong> dari menu HP Anda kapan saja tanpa loading browser!</span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-2xl bg-violet-600 py-3 text-xs font-bold text-white hover:bg-violet-700 transition active:scale-95 shadow-lg shadow-violet-200"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Pill / button variant
  return (
    <>
      <button
        onClick={handleInstallClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold hover:bg-white/30 transition active:scale-95 border border-white/25 shadow-sm ${className}`}
        title="Pasang Aplikasi Panca AI"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>

      {/* Modal Guide for iOS & Fallback */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative text-slate-800">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mb-4">
              <Download className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900">Pasang Panca AI di Layar Utama</h3>
            <p className="mt-1 text-xs text-slate-500">
              {isIOS 
                ? "Untuk pengguna iPhone/iPad di Safari:" 
                : "Untuk memasang di perangkat Anda:"}
            </p>

            <div className="mt-4 space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                <span>Ketuk ikon <strong>Bagikan (Share)</strong> <Share className="w-3 h-3 inline mx-0.5 text-violet-600" /> atau menu browser.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                <span>Pilih <strong>"Add to Home Screen"</strong> (Tambahkan ke Layar Utama).</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                <span>Ketuk <strong>Add</strong> di pojok kanan atas. Selesai!</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-2xl bg-violet-600 py-3 text-xs font-bold text-white hover:bg-violet-700 transition active:scale-95 shadow-lg shadow-violet-200"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
};
