'use client';

import React from 'react';
import { ShieldCheck, HeartHandshake, AlertTriangle, Scale, Lock, ArrowLeft, Mail } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/lib/hooks/use-i18n';

export default function PEAASPolicyPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col font-sans selection:bg-sky-500/30">
      
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-500/10 dark:bg-sky-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 dark:bg-blue-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="container mx-auto px-4 py-12 relative z-10 max-w-4xl">
        
        {/* Header */}
        <Link
          href="/"
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          {t('common.backToHome')}
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="size-12 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <ShieldCheck className="size-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('peaas.title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('peaas.subtitle')}
            </p>
          </div>
        </div>

        {/* Hero Card */}
        <Card className="p-6 md:p-8 shadow-lg shadow-sky-900/10 dark:shadow-none bg-gradient-to-r from-sky-500 to-blue-600 backdrop-blur-md border-0 rounded-3xl mb-12 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4">
            <Scale className="w-64 h-64" />
          </div>
          <h2 className="text-2xl font-bold mb-3 relative z-10">{t('peaas.heroTitle')}</h2>
          <p className="text-sky-50 text-lg leading-relaxed max-w-2xl relative z-10 font-medium">
            {t('peaas.heroText')}
          </p>
        </Card>

        {/* Content Sections */}
        <div className="space-y-8">
          
          <Section icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />} title={t('peaas.section1Title')}>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              {t('peaas.section1Text')}
            </p>
            <ul className="space-y-3">
              <ListItem title={t('peaas.s1i1Title')}>{t('peaas.s1i1Text')}</ListItem>
              <ListItem title={t('peaas.s1i2Title')}>{t('peaas.s1i2Text')}</ListItem>
              <ListItem title={t('peaas.s1i3Title')}>{t('peaas.s1i3Text')}</ListItem>
            </ul>
          </Section>

          <Section icon={<AlertTriangle className="w-6 h-6 text-amber-500" />} title={t('peaas.section2Title')}>
            <ul className="space-y-3">
              <ListItem title={t('peaas.s2i1Title')}>{t('peaas.s2i1Text')}</ListItem>
              <ListItem title={t('peaas.s2i2Title')}>{t('peaas.s2i2Text')}</ListItem>
              <ListItem title={t('peaas.s2i3Title')}>{t('peaas.s2i3Text')}</ListItem>
            </ul>
          </Section>

          <Section icon={<Lock className="w-6 h-6 text-sky-500" />} title={t('peaas.section3Title')}>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              {t('peaas.section3Text')}
            </p>
            <ul className="space-y-3">
              <ListItem title={t('peaas.s3i1Title')}>{t('peaas.s3i1Text')}</ListItem>
              <ListItem title={t('peaas.s3i2Title')}>{t('peaas.s3i2Text')}</ListItem>
              <ListItem title={t('peaas.s3i3Title')}>{t('peaas.s3i3Text')}</ListItem>
            </ul>
          </Section>

          <Section icon={<HeartHandshake className="w-6 h-6 text-rose-500" />} title={t('peaas.section4Title')}>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              {t('peaas.section4Text')}
            </p>
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-5 mt-4">
              <h4 className="font-semibold text-rose-900 dark:text-rose-200 mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4" /> {t('peaas.reportTitle')}
              </h4>
              <p className="text-rose-700 dark:text-rose-300 text-sm mb-4">
                {t('peaas.reportText')}
              </p>
              
              <div className="text-sm text-rose-800 dark:text-rose-200 space-y-3">
                <p>
                  <strong>{t('peaas.contactEmail')}</strong>{' '}
                  <a href="mailto:cordis@newman.education" className="text-rose-600 dark:text-rose-400 hover:underline font-medium">cordis@newman.education</a>
                </p>
                <p>
                  <strong>{t('peaas.linkText')}</strong>{' '}
                  <a href="https://newman.education/politica-de-ambientes-seguros-prevencion-de-explotacion-y-el-abuso-sexual" target="_blank" rel="noopener noreferrer" className="text-rose-600 dark:text-rose-400 hover:underline font-medium break-all">
                    https://newman.education/politica-de-ambientes-seguros-prevencion-de-explotacion-y-el-abuso-sexual
                  </a>
                </p>
              </div>
            </div>
          </Section>

        </div>

        <div className="mt-16 text-center pb-12">
          <p className="text-slate-400 text-sm italic">
            {t('peaas.footerQuote')}
          </p>
        </div>

      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) {
  return (
    <Card className="p-6 md:p-8 shadow-lg shadow-slate-200/40 dark:shadow-none bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-white/40 dark:border-slate-800/60 rounded-3xl">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700/50">
          {icon}
        </div>
        {title}
      </h3>
      {children}
    </Card>
  );
}

function ListItem({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
      <div>
        <strong className="text-slate-800 dark:text-slate-200 font-semibold">{title}:</strong>{' '}
        <span className="text-slate-600 dark:text-slate-400 leading-relaxed">{children}</span>
      </div>
    </li>
  );
}
