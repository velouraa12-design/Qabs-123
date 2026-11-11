import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useCustomizer } from '../context/CustomizerContext.tsx';
import {
  US_STATES_PRICING,
  QABS_FORMATION_PKGS
} from '../data/usStatesPricing.ts';
import {
  Building2,
  Store,
  ShieldCheck,
  CreditCard,
  Globe,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  Layers,
  Landmark,
  FileCheck2,
  Edit3,
  Phone,
  ExternalLink,
  Eye,
  Lock
} from 'lucide-react';

interface LandingViewProps {
  onOpenFormationModal: (stateCode?: string) => void;
  onOpenStoreModal: () => void;
  onOpenAIModal?: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onOpenFormationModal,
  onOpenStoreModal,
  onOpenAIModal
}) => {
  const { language, setMode, stores, activeStoreId, setActiveStoreId } = useApp();
  const { siteContent, setEditorOpen } = useCustomizer();
  const isAr = language === 'ar';

  // Hidden by default per user instruction ("أسعار كافة الولايات الأمريكية بشفافية تامة — خليه مخفي")
  const [showStatesPricing, setShowStatesPricing] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'popular' | 'zero_tax' | 'low_fee'>('all');
  const [selectedPkgId, setSelectedPkgId] = useState<'starter' | 'complete' | 'premium'>('complete');

  const selectedPkg =
    QABS_FORMATION_PKGS.find(p => p.id === selectedPkgId) || QABS_FORMATION_PKGS[1];

  const filteredStates = US_STATES_PRICING.filter(st => {
    const matchesSearch =
      st.nameAr.includes(stateSearch) ||
      st.nameEn.toLowerCase().includes(stateSearch.toLowerCase()) ||
      st.code.toLowerCase().includes(stateSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (stateFilter === 'popular') return st.tags.includes('popular');
    if (stateFilter === 'zero_tax') return st.tags.includes('zero_tax');
    if (stateFilter === 'low_fee') return st.stateFilingFee <= 100;
    return true;
  });

  return (
    <div className="space-y-16 pb-20">
      {/* 1. EXECUTIVE HERO SECTION (CUSTOMIZABLE VIA CUSTOMIZER CONTEXT) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-[#F2F9F9] to-white dark:from-[#03131D] dark:via-[#062030] dark:to-[#03131D] pt-10 pb-16 border-b-2 border-[#00A896]/25">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Hero Text Column */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#004457]/10 dark:bg-teal-950/80 border border-[#00A896]/40 text-[#004457] dark:text-teal-300 text-xs font-extrabold">
                <Sparkles className="w-3.5 h-3.5 text-[#00A896]" />
                <span>{isAr ? siteContent.heroBadgeAr : siteContent.heroBadgeEn}</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-[#003445] dark:text-white leading-tight">
                {isAr ? siteContent.heroTitleAr : siteContent.heroTitleEn}
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-medium max-w-2xl">
                {isAr ? siteContent.heroSubtitleAr : siteContent.heroSubtitleEn}
              </p>

              {/* Primary Hero Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => onOpenFormationModal('WY')}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#004457] via-[#006D77] to-[#00A896] text-white font-black text-xs sm:text-sm shadow-lg hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-4 h-4 text-[#E5C158]" />
                  <span>{isAr ? siteContent.heroCtaTextAr : siteContent.heroCtaTextEn}</span>
                </button>

                <button
                  onClick={() => setMode('portal')}
                  className="px-5 py-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-[#004457] text-[#004457] dark:text-teal-300 font-black text-xs sm:text-sm hover:bg-teal-50/60 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Store className="w-4 h-4 text-[#00A896]" />
                  <span>{isAr ? 'دخول بوابة العميل ومتاجر قبس' : 'Open Client Portal & Stores'}</span>
                </button>

                {onOpenAIModal && (
                  <button
                    onClick={onOpenAIModal}
                    className="px-4 py-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-[#C8A24A]/50 text-[#004457] dark:text-[#E5C158] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-[#C8A24A]" />
                    <span>{isAr ? 'مستشار قبس الذكي' : 'QABS Advisor'}</span>
                  </button>
                )}

                <button
                  onClick={() => setEditorOpen(true)}
                  className="px-3.5 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[#004457] dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  title={isAr ? 'تعديل نصوص وصور الواجهة' : 'Edit Hero & Package'}
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#00A896]" />
                  <span>{isAr ? 'تخصيص الواجهة' : 'Customize'}</span>
                </button>
              </div>

              {/* Official Quick Links Pill Strip */}
              <div className="pt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <a
                  href="https://qabs1.store"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#00A896] font-mono font-bold flex items-center gap-1"
                >
                  <Globe className="w-3.5 h-3.5 text-[#00A896]" />
                  <span>qabs1.store</span>
                </a>
                <span>•</span>
                <a
                  href="https://portal.qabs1.store"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#00A896] font-mono font-bold"
                >
                  portal.qabs1.store
                </a>
                <span>•</span>
                <a
                  href="https://staging.qabs1.store"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#00A896] font-mono font-bold"
                >
                  staging.qabs1.store
                </a>
                <span>•</span>
                <a
                  href={`https://wa.me/${siteContent.whatsappNumber.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#00A896] font-mono font-bold flex items-center gap-1"
                >
                  <Phone className="w-3.5 h-3.5 text-[#C8A24A]" />
                  <span dir="ltr">{siteContent.whatsappNumber}</span>
                </a>
              </div>
            </div>

            {/* Hero Right Column: Turnkey Package Showcase Card ($349) */}
            <div className="lg:col-span-5">
              <div className="bg-white dark:bg-[#071D2B] border-2 border-[#00A896]/40 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <img
                    src="/qabas-logo.png"
                    alt="QABS | قبس"
                    className="h-12 w-auto object-contain bg-white rounded-xl px-2 py-1 border border-slate-100"
                  />
                  <div className="text-left">
                    <span className="text-[11px] text-slate-400 block">
                      {isAr ? 'باقة التأسيس والدفع الشاملة' : 'Turnkey Launch Package'}
                    </span>
                    <span className="text-2xl font-black text-[#004457] dark:text-[#E5C158] font-mono">
                      ${siteContent.showcasePrice}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-black text-[#003445] dark:text-white">
                    {isAr ? siteContent.showcasePackageTitleAr : siteContent.showcasePackageTitleEn}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {isAr
                      ? 'تشمل تأسيس الشركة الأمريكية، الرقم الضريبي EIN، العنوان، وتجهيز بوابات الدفع والمتجر الإلكتروني'
                      : 'Includes US LLC formation, IRS EIN, Registered Agent address, payment gateway prep & store'}
                  </p>
                </div>

                <ul className="space-y-2.5">
                  {(isAr ? siteContent.showcaseFeaturesAr : siteContent.showcaseFeaturesEn).map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-[#00A896] shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    onClick={() => onOpenFormationModal('WY')}
                    className="py-3 px-4 rounded-xl bg-[#004457] hover:bg-[#003342] text-white font-black text-xs transition-all cursor-pointer text-center"
                  >
                    {isAr ? 'ابدأ تأسيس شركتك' : 'Form Company Now'}
                  </button>
                  <button
                    onClick={onOpenStoreModal}
                    className="py-3 px-4 rounded-xl bg-[#00A896] hover:bg-[#008f7f] text-white font-black text-xs transition-all cursor-pointer text-center"
                  >
                    {isAr ? 'أنشئ متجرك المستقل' : 'Create Online Store'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. QABS INTEGRATED SOVEREIGN SERVICES PILLARS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-black text-[#00A896] uppercase">
              {isAr ? 'منظومة قبس الرقمية المتكاملة' : 'QABS Unified Digital Ecosystem'}
            </span>
            <h2 className="text-2xl font-black text-[#003445] dark:text-white mt-1">
              {isAr
                ? 'كل ما تحتاجه لتأسيس شركتك وربط مدفوعاتك وإدارة متاجرك الإلكترونية'
                : 'Everything Needed to Form Companies, Connect Global Payments & Run Online Stores'}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Pillar 1: US & UK Company Formation */}
          <div
            onClick={() => onOpenFormationModal('WY')}
            className="p-6 rounded-2xl bg-white dark:bg-[#071D2B] border border-slate-200 dark:border-slate-800 hover:border-[#00A896] shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#004457]/10 dark:bg-teal-950 text-[#004457] dark:text-teal-300 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#00A896]" />
              </div>
              <h3 className="text-base font-black text-[#003445] dark:text-white">
                {isAr ? 'تأسيس الشركات الأمريكية والبريطانية' : 'US & UK Company Formation'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isAr
                  ? 'تأسيس LLC أو C-Corp في كافة الولايات الخمسين (وايومنغ، ديلاوير، نيو مكسيكو...) والشركات البريطانية LTD.'
                  : 'Register LLC or C-Corp in all 50 US states or UK LTD with full corporate documents.'}
              </p>
            </div>
            <span className="text-xs font-black text-[#00A896]">
              {isAr ? 'فتح بوابة التأسيس ←' : 'Open Formation Wizard →'}
            </span>
          </div>

          {/* Pillar 2: EIN, Registered Agent & Annual Renewals */}
          <div
            onClick={() => setMode('portal')}
            className="p-6 rounded-2xl bg-white dark:bg-[#071D2B] border border-slate-200 dark:border-slate-800 hover:border-[#00A896] shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#004457]/10 dark:bg-teal-950 text-[#004457] dark:text-teal-300 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5 text-[#C8A24A]" />
              </div>
              <h3 className="text-base font-black text-[#003445] dark:text-white">
                {isAr ? 'الرقم الضريبي EIN والوكيل المسجل والتجديدات' : 'EIN, Registered Agent & Compliance'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isAr
                  ? 'استخراج خطاب EIN الرسمي من IRS، عنوان أمريكي معتمد، وإدارة التقارير والتجديدات السنوية.'
                  : 'Official IRS CP575 EIN issuance, registered agent address, and annual state filings.'}
              </p>
            </div>
            <span className="text-xs font-black text-[#00A896]">
              {isAr ? 'إدارة الوثائق والامتثال ←' : 'Manage Compliance →'}
            </span>
          </div>

          {/* Pillar 3: QABS Stores & Studio */}
          <div
            onClick={() => setMode('portal')}
            className="p-6 rounded-2xl bg-white dark:bg-[#071D2B] border border-slate-200 dark:border-slate-800 hover:border-[#00A896] shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#004457]/10 dark:bg-teal-950 text-[#004457] dark:text-teal-300 flex items-center justify-center">
                <Store className="w-5 h-5 text-[#00A896]" />
              </div>
              <h3 className="text-base font-black text-[#003445] dark:text-white">
                {isAr ? 'منصة متاجر قبس (QABS Stores & Studio)' : 'QABS Multi-Tenant Stores & Studio'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isAr
                  ? 'متجر إلكتروني مستقل لكل عميل بلوحة تحكم من 16 قسماً واستوديو تصميم مرئي وعزل كامل للبيانات.'
                  : 'Independent online store per client with 16-section dashboard, visual QABS Studio, and full isolation.'}
              </p>
            </div>
            <span className="text-xs font-black text-[#00A896]">
              {isAr ? 'إدارة المتاجر الإلكترونية ←' : 'Open QABS Stores →'}
            </span>
          </div>

          {/* Pillar 4: Global Banking & Payment Gateways */}
          <div
            onClick={() => setMode('billing')}
            className="p-6 rounded-2xl bg-white dark:bg-[#071D2B] border border-slate-200 dark:border-slate-800 hover:border-[#00A896] shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-[#004457]/10 dark:bg-teal-950 text-[#004457] dark:text-teal-300 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-[#C8A24A]" />
              </div>
              <h3 className="text-base font-black text-[#003445] dark:text-white">
                {isAr ? 'البنوك العالمية وبوابات الدفع والاشتراكات' : 'Global Banking, Gateways & Billing'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isAr
                  ? 'ربط حسابات Mercury و Wise وبوابات الدفع Stripe و PayPal و Tap و Moyasar بعد اعتماد قبس.'
                  : 'Connect Mercury, Wise, Stripe, PayPal, Tap & Moyasar with verified governance.'}
              </p>
            </div>
            <span className="text-xs font-black text-[#00A896]">
              {isAr ? 'عرض الباقات والمدفوعات ←' : 'View Plans & Banking →'}
            </span>
          </div>
        </div>
      </section>

      {/* 3. COLLAPSIBLE (HIDDEN BY DEFAULT) ALL 50 US STATES TRANSPARENT PRICING */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-white dark:bg-[#071D2B] border-2 border-[#004457]/20 dark:border-cyan-950 p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black text-[#00A896]">
                {isAr
                  ? 'أسعار كافة الولايات الأمريكية بشفافية تامة — شاملة الرسوم الحكومية'
                  : 'Transparent All 50 US States Formation Pricing — Including State Filing Fees'}
              </span>
              <h3 className="text-lg sm:text-xl font-black text-[#003445] dark:text-white mt-0.5">
                {isAr
                  ? 'تشمل جميع الباقات: رسوم سكرتير الولاية الحكومية + تأسيس (50 ولاية أمريكية)'
                  : 'All Packages Include: Secretary of State Filing Fee + Formation (All 50 US States)'}
              </h3>
            </div>

            <button
              onClick={() => setShowStatesPricing(!showStatesPricing)}
              className="px-5 py-2.5 rounded-xl bg-[#004457] hover:bg-[#003342] text-white text-xs font-black flex items-center gap-2 cursor-pointer self-start sm:self-center shadow-sm"
            >
              <span>
                {showStatesPricing
                  ? isAr
                    ? 'إخفاء جدول أسعار الولايات الأمريكية (50 ولاية)'
                    : 'Hide All 50 US States Pricing'
                  : isAr
                  ? 'عرض أسعار كافة الولايات الأمريكية (50 ولاية)'
                  : 'Show All 50 US States Pricing'}
              </span>
              {showStatesPricing ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showStatesPricing && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5 animate-fade-in">
              {/* Package Tier Selector & State Search */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {QABS_FORMATION_PKGS.map(pkg => (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer transition-all ${
                        selectedPkgId === pkg.id
                          ? 'bg-[#004457] text-white border-[#004457]'
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {isAr ? `باقة ${pkg.nameAr} ($${pkg.price} + رسوم الولاية)` : `${pkg.nameEn} ($${pkg.price} + State Fee)`}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={isAr ? 'ابحث عن الولاية (مثال: وايومنغ / WY)...' : 'Search state...'}
                      value={stateSearch}
                      onChange={e => setStateSearch(e.target.value)}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pr-8 pl-3 py-1.5 text-xs"
                    />
                  </div>
                  <select
                    value={stateFilter}
                    onChange={e => setStateFilter(e.target.value as any)}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-bold"
                  >
                    <option value="all">{isAr ? 'كل الولايات (50)' : 'All 50 States'}</option>
                    <option value="popular">{isAr ? 'الأكثر شعبية ⭐' : 'Most Popular'}</option>
                    <option value="zero_tax">{isAr ? 'بدون ضريبة ولاية' : 'Zero State Tax'}</option>
                    <option value="low_fee">{isAr ? 'رسوم حكومية منخفضة' : 'Low Filing Fee'}</option>
                  </select>
                </div>
              </div>

              {/* States Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[520px] overflow-y-auto p-1">
                {filteredStates.map(st => {
                  const totalWithPkg = st.stateFilingFee + selectedPkg.price;
                  return (
                    <div
                      key={st.code}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#00A896] bg-slate-50/60 dark:bg-slate-900/60 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-[#003445] dark:text-white">
                            {isAr ? st.nameAr : st.nameEn}{' '}
                            <span className="text-xs font-mono text-[#00A896]">({st.code})</span>
                          </span>
                          {st.badgeAr && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              {isAr ? st.badgeAr : st.badgeEn}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {isAr ? st.recommendedForAr : st.recommendedForEn}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-500">
                            {isAr ? `رسوم الولاية: $${st.stateFilingFee}` : `State Fee: $${st.stateFilingFee}`}
                          </span>
                          <span className="font-mono font-black text-base text-[#004457] dark:text-teal-300">
                            ${totalWithPkg}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onOpenFormationModal(st.code)}
                        className="w-full py-2 rounded-xl bg-[#004457] hover:bg-[#003342] text-white text-xs font-bold cursor-pointer"
                      >
                        {isAr ? `تأسيس في ${st.nameAr}` : `Form in ${st.nameEn}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* End of Main Content */}
    </div>
  );
};

