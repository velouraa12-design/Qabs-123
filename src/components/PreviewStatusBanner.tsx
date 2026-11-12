import React from 'react';
import { Activity, ArrowUpRight, Database, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

export const PreviewStatusBanner: React.FC = () => {
  const { language, mode, setMode } = useApp();
  const isAr = language === 'ar';

  return (
    <section
      aria-label={isAr ? 'حالة إصدار قبس' : 'QABS release status'}
      className="border-b border-[#D5B46B]/30 bg-[#14243E] text-white shadow-[0_8px_24px_rgba(20,36,62,0.16)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#D5B46B]/15 border border-[#D5B46B]/40 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-[#E8C978]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-black tracking-[0.16em] uppercase text-[#E8C978]">
                <span>{isAr ? 'مركز تشغيل قبس' : 'QABS CONTROL CENTER'}</span>
                <span className="w-1 h-1 rounded-full bg-emerald-300" aria-hidden="true" />
                <span className="text-emerald-200">{isAr ? 'نسخة معاينة' : 'Preview build'}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-white">
                {isAr ? 'واجهة موحدة بهوية قبس الكحلية والذهبية' : 'Unified workspace in the QABS navy & gold system'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                {isAr
                  ? 'الحالة المعروضة صادقة: الواجهة تعمل، والبيانات الخلفية والهوية الإنتاجية ما زالت قيد الربط الآمن.'
                  : 'Status is explicit: the UI is available, while backend persistence and production identity remain safely gated.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1.5 text-emerald-100">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {isAr ? 'CI ناجح' : 'CI passed'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/25 bg-sky-300/10 px-2.5 py-1.5 text-sky-100">
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              {isAr ? 'Backend قيد الربط' : 'Backend in progress'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5B46B]/35 bg-[#D5B46B]/10 px-2.5 py-1.5 text-[#F2D995]">
              <LockKeyhole className="w-3.5 h-3.5" aria-hidden="true" />
              {isAr ? 'الدفع محمي' : 'Payments gated'}
            </span>
            <button
              type="button"
              onClick={() => setMode(mode === 'portal' ? 'landing' : 'portal')}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#D5B46B] px-3.5 py-2 text-[11px] font-black text-[#14243E] transition-colors hover:bg-[#E8C978] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#14243E]"
            >
              {mode === 'portal' ? (isAr ? 'العودة للموقع' : 'Back to showcase') : isAr ? 'فتح لوحة التحكم' : 'Open dashboard'}
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
