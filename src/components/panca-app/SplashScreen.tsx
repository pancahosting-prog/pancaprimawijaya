import React from 'react';
import { RobotIllustration } from './RobotIllustration';
import { Sparkles, ArrowRight, ExternalLink, Wifi, Battery, Signal } from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallButton';

interface SplashScreenProps {
  onNext: () => void;
  onOpenWebCRM?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onNext, onOpenWebCRM }) => {
  return (
    <div className="relative min-h-screen w-full max-w-md mx-auto bg-gradient-to-b from-[#8b5cf6] via-[#7c3aed] to-[#6d28d9] flex flex-col justify-between overflow-hidden text-white font-sans shadow-2xl">
      {/* Dynamic Background Circles */}
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-64 h-64 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />

      {/* Top Mobile Status Bar Simulation */}
      <div className="relative z-10 pt-3 px-6 flex items-center justify-between text-white/90 text-xs font-semibold">
        <span className="tracking-tight font-medium">8:15</span>
        <div className="flex items-center gap-2">
          <Signal className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          <Battery className="w-4 h-4" />
        </div>
      </div>

      {/* App Header Logo Pill */}
      <div className="relative z-10 pt-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 shadow-sm">
          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-inner">
            <span className="text-violet-600 text-xs font-black">🤖</span>
          </div>
          <span className="text-xs font-extrabold tracking-wider uppercase text-white">Panca AI</span>
        </div>

        {/* In-App PWA Install Pill */}
        <PWAInstallButton variant="pill" />
      </div>

      {/* Center Robot Hero Graphic */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6">
        <RobotIllustration size={230} className="transform hover:scale-105 transition-transform duration-300" />
      </div>

      {/* Bottom Sheet Card */}
      <div className="relative z-20 bg-white rounded-t-[36px] px-7 pt-8 pb-9 text-slate-800 shadow-[0_-20px_40px_rgba(0,0,0,0.18)] animate-in slide-in-from-bottom-6 duration-300">
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />

        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 text-violet-600 text-[11px] font-bold tracking-wide uppercase mb-3">
            <Sparkles className="w-3 h-3" />
            <span>Smart AI Assistant</span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Panca AI
          </h1>

          <div className="mt-2.5 space-y-1">
            <p className="text-base font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Welcome to Panca AI
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">
              "All in one data management"
            </p>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500 max-w-xs mx-auto">
            Intelligent Chats Unleashed: Your Smart Companion, Always Ready to Assist Seamlessly with business CRM, stock, tasks, and file management.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-7 space-y-3">
          <button
            onClick={onNext}
            className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-xl shadow-violet-200 flex items-center justify-center gap-2.5 transition active:scale-[0.98] group"
          >
            <span className="text-sm font-extrabold tracking-wide">Next</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </button>

          {onOpenWebCRM && (
            <button
              onClick={onOpenWebCRM}
              className="w-full py-3 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold rounded-2xl text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] border border-slate-200"
            >
              <span>Buka Desktop Web CRM</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
