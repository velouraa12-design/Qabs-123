import React from 'react';
import { Globe, Sun, Moon, User } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { QabsLogo } from './QabsLogo.tsx';

interface HeaderProps {
  onOpenFormationModal: () => void;
  onOpenStoreModal: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  const { language, setLanguage, theme, toggleTheme, setMode, showToast } = useApp();
  const isAr = language === 'ar';
  const unavailable = () => showToast(isAr ? 'تسجيل الدخول غير متاح في هذه المعاينة.' : 'Sign-in is not available in this preview.');
  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#002B38]/95 border-b border-[#C8A24A]/40 text-[#003E52] dark:text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-20 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setMode('landing')} aria-label={isAr ? 'قبس — الصفحة الرئيسية' : 'QABS — home'} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004457]">
          <QabsLogo size="md" />
        </button>
        <nav aria-label={isAr ? 'إعدادات العرض' : 'Display settings'} className="flex items-center gap-2">
          <button type="button" onClick={unavailable} className="min-h-11 px-3 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-[#004457] dark:bg-slate-800 dark:text-white text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004457]" aria-label={isAr ? 'تسجيل الدخول غير متاح في المعاينة' : 'Sign-in unavailable in preview'}><User className="w-4 h-4" aria-hidden="true" /><span className="hidden sm:inline">{isAr ? 'الحساب' : 'Account'}</span></button>
          <button type="button" onClick={() => setLanguage(isAr ? 'en' : 'ar')} aria-label={isAr ? 'EN — Switch to English' : 'عربي — التحويل إلى العربية'} className="min-h-11 px-3 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-[#004457] dark:bg-slate-800 dark:text-white text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004457]"><Globe className="w-4 h-4" aria-hidden="true" />{isAr ? 'EN' : 'عربي'}</button>
          <button type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? (isAr ? 'الوضع الفاتح' : 'Light mode') : (isAr ? 'الوضع الداكن' : 'Dark mode')} className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-[#004457] dark:bg-slate-800 dark:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004457]">{theme === 'dark' ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}</button>
        </nav>
      </div>
    </header>
  );
};
