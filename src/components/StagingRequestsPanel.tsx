import React from 'react';
import { CircleAlert, Database, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { stagingApiEnabled } from '../services/qabsStagingApi.ts';

const requestLabels: Record<string, [string, string]> = {
  formation: ['طلب تأسيس شركة', 'Company formation'],
  store: ['طلب إنشاء متجر', 'Store creation'],
  support: ['تذكرة دعم', 'Support ticket']
};

function labelForKind(kind: string, isAr: boolean) {
  const group = kind.split('.')[0];
  const labels = requestLabels[group];
  return labels ? (isAr ? labels[0] : labels[1]) : kind;
}

function statusLabel(status: string, isAr: boolean) {
  const labels: Record<string, [string, string]> = {
    submitted: ['مُرسل', 'Submitted'],
    in_review: ['قيد المراجعة', 'In review'],
    approved: ['معتمد', 'Approved'],
    rejected: ['مرفوض', 'Rejected'],
    completed: ['مكتمل', 'Completed']
  };
  return labels[status] ? (isAr ? labels[status][0] : labels[status][1]) : status;
}

export const StagingRequestsPanel: React.FC = () => {
  const { user, language, platformRequests, platformRequestsLoading, platformError, refreshPlatformRequests } = useApp();
  const isAr = language === 'ar';

  if (!stagingApiEnabled || !user || user.id === 'guest') return null;

  return (
    <section
      dir={isAr ? 'rtl' : 'ltr'}
      className="rounded-2xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/70 dark:bg-[#071D2B] p-4 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#004457] text-white flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-[#004457] dark:text-white">
              {isAr ? 'طلبات Staging المحفوظة فعلياً' : 'Persisted staging requests'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {isAr ? 'مصدر البيانات: QABS API وقاعدة Staging' : 'Source: QABS API and staging database'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshPlatformRequests()}
          disabled={platformRequestsLoading}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#004457] px-3 py-2 text-[11px] font-black text-[#004457] dark:text-teal-100 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${platformRequestsLoading ? 'animate-spin' : ''}`} />
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {platformRequestsLoading && (
        <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">
          {isAr ? 'جارٍ تحميل الطلبات من الخادم…' : 'Loading requests from the server…'}
        </p>
      )}

      {!platformRequestsLoading && platformError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-200">
          <CircleAlert className="w-4 h-4 shrink-0" />
          <span>{platformError}</span>
        </div>
      )}

      {!platformRequestsLoading && !platformError && platformRequests.length === 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {isAr ? 'لا توجد طلبات محفوظة لهذا الحساب حتى الآن.' : 'No persisted requests for this account yet.'}
        </p>
      )}

      {!platformRequestsLoading && !platformError && platformRequests.length > 0 && (
        <div className="mt-4 space-y-2">
          {platformRequests.map(request => (
            <div
              key={request.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-cyan-100 dark:border-cyan-950 bg-white dark:bg-slate-900 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-xs font-black text-[#004457] dark:text-white">
                  {labelForKind(request.kind, isAr)}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{request.id}</div>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded-full bg-teal-50 px-2 py-1 font-black text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                  {statusLabel(request.status, isAr)}
                </span>
                <time className="text-slate-400" dateTime={request.updatedAt}>
                  {new Date(request.updatedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                </time>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
