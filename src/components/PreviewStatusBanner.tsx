import React from 'react';
import { useApp } from '../context/AppContext.tsx';

export const PreviewStatusBanner: React.FC = () => {
  const { language } = useApp();
  return (
    <aside aria-label={language === 'ar' ? 'تنبيه المعاينة' : 'Preview notice'} className="bg-[#14243E] text-white border-b border-[#D5B46B]/40">
      <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm leading-6">
        {language === 'ar' ? 'هذه معاينة للمعلومات فقط. تسجيل الدخول والطلبات والدفع غير متاحة من هذه النسخة.' : 'This is an informational preview. Sign-in, orders and payments are unavailable in this version.'}
      </p>
    </aside>
  );
};
