'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db as firestoreDb } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Coins, Loader2, ArrowLeft, RefreshCw, BarChart3, Database } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';

interface UsageLog {
  id: string;
  uid: string;
  email: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  source: string;
  createdAt: number;
}

export default function UsageDashboard() {
  const router = useRouter();
  const { role, loading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(firestoreDb, 'usage_logs'),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
      
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          uid: d.uid,
          email: d.email,
          model: d.model,
          promptTokens: d.promptTokens || 0,
          completionTokens: d.completionTokens || 0,
          totalTokens: d.totalTokens || 0,
          cost: d.cost || 0,
          source: d.source || 'unknown',
          createdAt: d.createdAt?.toMillis() || 0,
        } as UsageLog;
      });
      
      setLogs(data);
    } catch (error) {
      console.error('Error fetching usage logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      fetchLogs();
    }
  }, [role]);

  if (authLoading || role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  // Calculate Metrics
  const totalCost = logs.reduce((acc, log) => acc + log.cost, 0);
  const totalTokens = logs.reduce((acc, log) => acc + log.totalTokens, 0);
  const totalGenerations = logs.length;

  // Chart Data: Group by Date (YYYY-MM-DD)
  const chartData = Object.values(
    logs.reduce((acc, log) => {
      if (!log.createdAt) return acc;
      const d = new Date(log.createdAt);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!acc[dateStr]) {
        acc[dateStr] = { date: dateStr, cost: 0, tokens: 0, timestamp: d.getTime() };
      }
      acc[dateStr].cost += log.cost;
      acc[dateStr].tokens += log.totalTokens;
      return acc;
    }, {} as Record<string, { date: string; cost: number; tokens: number; timestamp: number }>)
  ).sort((a, b) => b.timestamp - a.timestamp).slice(0, 15).reverse(); // Show last 15 days of data

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
  const fullDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header (Back button matching admin/logs/page.tsx) */}
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t('common.backToHome')}
        </button>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Activity className="size-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {t('adminUsage.title')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('adminUsage.description')}
              </p>
            </div>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 text-slate-700 dark:text-slate-200"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('adminUsage.refresh')}
          </button>
        </div>

        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t('adminUsage.totalCost')}
                </CardTitle>
                <Coins className="size-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  ${totalCost.toFixed(4)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t('adminUsage.tokensProcessed')}
                </CardTitle>
                <Database className="size-4 text-sky-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {totalTokens.toLocaleString(locale)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t('adminUsage.requests')}
                </CardTitle>
                <BarChart3 className="size-4 text-violet-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {totalGenerations.toLocaleString(locale)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <BarChart3 className="size-4 text-slate-500 dark:text-slate-400" />
                {t('adminUsage.dailySpend')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && logs.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="size-8 text-sky-500 animate-spin" />
                </div>
              ) : chartData.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }} 
                        tickMargin={10}
                        stroke="currentColor" 
                        className="text-slate-500 dark:text-slate-400 opacity-80"
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                          return dateFormatter.format(d);
                        }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }} 
                        stroke="currentColor" 
                        className="text-slate-500 dark:text-slate-400 opacity-80"
                        tickFormatter={(val) => `$${val.toFixed(3)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '0.5rem',
                          fontSize: '13px',
                          color: 'hsl(var(--foreground))'
                        }}
                        formatter={(value: any) => [`$${Number(value).toFixed(4)}`, t('adminUsage.cost')]}
                        labelFormatter={(label) => {
                          const d = new Date(label);
                          d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                          return fullDateFormatter.format(d);
                        }}
                      />
                      <Bar dataKey="cost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
                  {t('adminUsage.noChartData')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detailed Table container matching admin/logs/page.tsx */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t('adminUsage.detailedLog')}
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.date')}</th>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.user')}</th>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.model')}</th>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.source')}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('adminUsage.promptTokens')}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('adminUsage.completionTokens')}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('adminUsage.cost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <Loader2 className="size-6 animate-spin mx-auto mb-2 text-slate-400" />
                        {t('adminUsage.loading')}
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        {t('adminUsage.noRecords')}
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                          {log.createdAt ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(log.createdAt)) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          <div className="font-medium">{log.email}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{log.uid.slice(0, 8)}...</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline" className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                            {log.model}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="secondary" className="text-[10px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-none">
                            {log.source}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-slate-500 dark:text-slate-400 text-xs">
                          {log.promptTokens.toLocaleString(locale)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sky-600 dark:text-sky-400 text-xs font-medium">
                          {log.completionTokens.toLocaleString(locale)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-medium text-emerald-600 dark:text-emerald-400 text-xs">
                          ${log.cost.toFixed(5)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
