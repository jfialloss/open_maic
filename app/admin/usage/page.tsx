'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs, where, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db as firestoreDb } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Coins, Loader2, ArrowLeft, RefreshCw, BarChart3, Database, Calendar, User, Cpu, BookOpen, Layers, Image, Volume2, Key } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
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
  stageId?: string | null;
}

type DateRange = '7d' | '30d' | 'this_month' | 'last_month';

const COLORS = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#64748b'];

export default function UsageDashboard() {
  const router = useRouter();
  const { role, loading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [visibleCount, setVisibleCount] = useState(50);
  const [courseNames, setCourseNames] = useState<Record<string, string>>({});
  const [loadingNames, setLoadingNames] = useState(false);
  const [filterGlobalLibrary, setFilterGlobalLibrary] = useState(true);
  const [globalStageIds, setGlobalStageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  const fetchLogs = async () => {
    setLoading(true);
    setVisibleCount(50);
    try {
      let startDate = new Date();
      let endDate = new Date();

      if (dateRange === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (dateRange === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      } else if (dateRange === 'this_month') {
        startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      } else if (dateRange === 'last_month') {
        startDate = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth(), 0, 23, 59, 59);
      }

      const q = query(
        collection(firestoreDb, 'usage_logs'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        
        let promptTokens = d.promptTokens || 0;
        let completionTokens = d.completionTokens || 0;
        let source = d.source || 'unknown';
        let model = d.model || 'unknown';
        
        // Fallback estimation for old records where AI SDK failed to log usage
        if (promptTokens === 0 && completionTokens === 0) {
          if (source === 'outline') {
            promptTokens = 1500;
            completionTokens = 600;
          } else if (source === 'content') {
            promptTokens = 2500;
            completionTokens = 1200;
          } else if (source === 'actions') {
            promptTokens = 1800;
            completionTokens = 500;
          } else {
            promptTokens = 1000;
            completionTokens = 500;
          }
        }

        let cost = d.cost || 0;
        if (cost === 0) {
          // Simple Flash pricing fallback estimation
          cost = (promptTokens / 1_000_000) * 0.075 + (completionTokens / 1_000_000) * 0.30;
        }

        return {
          id: doc.id,
          uid: d.uid,
          email: d.email,
          model: model,
          promptTokens: promptTokens,
          completionTokens: completionTokens,
          totalTokens: promptTokens + completionTokens,
          cost: cost,
          source: source,
          createdAt: d.createdAt?.toMillis() || 0,
          stageId: d.stageId || null,
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
  }, [role, dateRange]);

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + 50);
  };

  useEffect(() => {
    if (logs.length === 0) return;

    const fetchCourseNames = async () => {
      setLoadingNames(true);
      const uniqueStageIds = Array.from(new Set(logs.map(log => log.stageId).filter(Boolean))) as string[];
      
      const namesMap: Record<string, string> = {};
      const globalIds = new Set<string>();
      await Promise.all(
        uniqueStageIds.map(async (stageId) => {
          try {
            const docRef = doc(firestoreDb, 'global_classrooms', stageId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const stageData = docSnap.data();
              namesMap[stageId] = stageData.stage?.name || stageData.stage?.topic || 'Curso Sin Nombre';
              globalIds.add(stageId);
            } else {
              namesMap[stageId] = `ID: ${stageId}`;
            }
          } catch (err) {
            namesMap[stageId] = `ID: ${stageId}`;
          }
        })
      );
      setCourseNames(namesMap);
      setGlobalStageIds(globalIds);
      setLoadingNames(false);
    };

    fetchCourseNames();
  }, [logs]);

  interface CourseAggregatedCost {
    stageId: string;
    courseName: string;
    email: string;
    outline: number;
    content: number;
    actions: number;
    image: number;
    tts: number;
    other: number;
    totalCost: number;
    totalTokens: number;
    requestCount: number;
    createdAt: number;
  }

  const courseAggregatedCosts = useMemo(() => {
    const groups: Record<string, CourseAggregatedCost> = {};
    
    logs.forEach(log => {
      if (!log.stageId) return;
      
      // Filter: if filterGlobalLibrary is active, only include if stageId exists in global_classrooms
      if (filterGlobalLibrary && !loadingNames && !globalStageIds.has(log.stageId)) {
        return;
      }
      
      if (!groups[log.stageId]) {
        groups[log.stageId] = {
          stageId: log.stageId,
          courseName: courseNames[log.stageId] || `ID: ${log.stageId}`,
          email: log.email || 'unknown',
          outline: 0,
          content: 0,
          actions: 0,
          image: 0,
          tts: 0,
          other: 0,
          totalCost: 0,
          totalTokens: 0,
          requestCount: 0,
          createdAt: log.createdAt,
        };
      }
      
      const group = groups[log.stageId];
      group.totalTokens += log.totalTokens;
      group.requestCount += 1;
      group.totalCost += log.cost;
      
      if (log.createdAt && log.createdAt < group.createdAt) {
        group.createdAt = log.createdAt;
      }
      
      if (log.source === 'outline') {
        group.outline += log.cost;
      } else if (log.source === 'content') {
        group.content += log.cost;
      } else if (log.source === 'actions') {
        group.actions += log.cost;
      } else if (log.source === 'image') {
        group.image += log.cost;
      } else if (log.source === 'tts') {
        group.tts += log.cost;
      } else {
        group.other += log.cost;
      }
    });
    
    return Object.values(groups).sort((a, b) => b.createdAt - a.createdAt);
  }, [logs, courseNames, globalStageIds, filterGlobalLibrary, loadingNames]);

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
        acc[dateStr] = { date: dateStr, cost: 0, tokens: 0, count: 0, timestamp: d.getTime() };
      }
      acc[dateStr].cost += log.cost;
      acc[dateStr].tokens += log.totalTokens;
      acc[dateStr].count += 1;
      return acc;
    }, {} as Record<string, { date: string; cost: number; tokens: number; count: number; timestamp: number }>)
  ).sort((a, b) => a.timestamp - b.timestamp); 

  // User Spend Data
  const userSpendData = Object.values(
    logs.reduce((acc, log) => {
      if (!acc[log.email]) {
        acc[log.email] = { email: log.email, cost: 0, tokens: 0, count: 0 };
      }
      acc[log.email].cost += log.cost;
      acc[log.email].tokens += log.totalTokens;
      acc[log.email].count += 1;
      return acc;
    }, {} as Record<string, { email: string; cost: number; tokens: number; count: number }>)
  ).sort((a, b) => b.cost - a.cost).slice(0, 10);

  // Model Spend Data
  const modelSpendData = Object.values(
    logs.reduce((acc, log) => {
      if (!acc[log.model]) {
        acc[log.model] = { name: log.model, value: 0 };
      }
      acc[log.model].value += log.cost;
      return acc;
    }, {} as Record<string, { name: string; value: number }>)
  ).sort((a, b) => b.value - a.value);

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
  const fullDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t('common.backToHome')}
        </button>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Activity className="size-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {t('adminUsage.title') || 'Consumo y Costos de IA'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('adminUsage.description') || 'Monitorea el uso y costo de la API de Gemini.'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                disabled={loading}
                className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg text-sm font-medium py-2 pl-4 pr-10 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="7d">{t('adminUsage.timeFilter7Days') || 'Últimos 7 días'}</option>
                <option value="30d">{t('adminUsage.timeFilter30Days') || 'Últimos 30 días'}</option>
                <option value="this_month">{t('adminUsage.timeFilterThisMonth') || 'Mes actual'}</option>
                <option value="last_month">{t('adminUsage.timeFilterLastMonth') || 'Mes pasado'}</option>
              </select>
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            </div>

            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 text-slate-700 dark:text-slate-200"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t('adminUsage.totalCost') || 'Costo Total'}
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
                  {t('adminUsage.tokensProcessed') || 'Tokens Procesados'}
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
                  {t('adminUsage.requests') || 'Generaciones'}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Chart */}
            <Card className="lg:col-span-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <BarChart3 className="size-4 text-slate-500 dark:text-slate-400" />
                  {t('adminUsage.dailySpend') || 'Gasto Diario'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
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
                          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length && label !== undefined) {
                              const d = new Date(label as string | number);
                              d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                              const formattedDate = fullDateFormatter.format(d);
                              return (
                                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl p-3 min-w-[140px]">
                                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mb-1.5 font-medium uppercase tracking-wider">
                                    {formattedDate}
                                  </p>
                                  <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm">
                                    <div className="size-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></div>
                                    <span>{t('adminUsage.cost') || 'Costo'}: ${Number(payload[0].value).toFixed(4)}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="cost" 
                          fill="#f43f5e" 
                          radius={[4, 4, 0, 0]} 
                          activeBar={{ 
                            fill: '#fb7185', 
                            filter: 'drop-shadow(0 0 6px rgba(244,63,94,0.6))' 
                          }} 
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
                    {t('adminUsage.noChartData') || 'No hay datos'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Model Distribution Chart */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <Cpu className="size-4 text-slate-500 dark:text-slate-400" />
                  {t('adminUsage.costByModel') || 'Costos por Modelo'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="size-8 text-sky-500 animate-spin" />
                  </div>
                ) : modelSpendData.length > 0 ? (
                  <div className="h-[300px] w-full flex flex-col items-center">
                    <ResponsiveContainer width="100%" height="80%">
                      <PieChart>
                        <Pie
                          data={modelSpendData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {modelSpendData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: any) => `$${Number(value).toFixed(4)}`}
                          contentStyle={{ borderRadius: '0.5rem', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full flex flex-wrap justify-center gap-3 mt-2">
                      {modelSpendData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                          <div className="size-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="text-slate-600 dark:text-slate-300 truncate max-w-[100px]" title={entry.name}>
                            {entry.name.replace('models/', '').replace('-preview', '')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
                    No hay datos
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* User Spend Table */}
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <User className="size-4 text-slate-500 dark:text-slate-400" />
                {t('adminUsage.topUsersSpend') || 'Top 10 Usuarios por Gasto'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="size-6 text-sky-500 animate-spin" />
                </div>
              ) : userSpendData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase">
                      <tr>
                        <th className="px-4 py-3 font-medium">Usuario</th>
                        <th className="px-4 py-3 font-medium text-right">{t('adminUsage.tokensProcessed') || 'Tokens'}</th>
                        <th className="px-4 py-3 font-medium text-right">{t('adminUsage.requests') || 'Peticiones'}</th>
                        <th className="px-4 py-3 font-medium text-right">{t('adminUsage.cost') || 'Costo Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {userSpendData.map((user, idx) => (
                        <tr key={user.email} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono text-xs w-4">{idx + 1}.</span>
                              {user.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                            {user.count}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sky-600 dark:text-sky-400 text-xs">
                            {user.tokens.toLocaleString(locale)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                            ${user.cost.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  No hay datos
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unit Economics Section */}
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/50 gap-4">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <BookOpen className="size-4 text-rose-500" />
                  Unit Economics: Costo de Generación por Curso
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Costo total acumulado por sesión de generación (agrupado por curso). Útil para fijar precios de venta y analizar rentabilidad.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Premium Tab Toggle */}
                <div className="bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg flex items-center shrink-0 border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setFilterGlobalLibrary(true)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      filterGlobalLibrary
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Solo Biblioteca Global
                  </button>
                  <button
                    onClick={() => setFilterGlobalLibrary(false)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      !filterGlobalLibrary
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Todos
                  </button>
                </div>

                {courseAggregatedCosts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <span className="text-slate-400">{filterGlobalLibrary ? 'Cursos Guardados:' : 'Cursos Generados:'}</span>
                      <span className="text-slate-800 dark:text-slate-200 font-bold font-mono">{courseAggregatedCosts.length}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <span className="text-slate-400">Costo Promedio:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                        ${(courseAggregatedCosts.reduce((acc, c) => acc + c.totalCost, 0) / courseAggregatedCosts.length).toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading || loadingNames ? (
                <div className="py-12 flex justify-center items-center flex-col gap-2">
                  <Loader2 className="size-8 text-sky-500 animate-spin" />
                  <span className="text-xs text-slate-400">Verificando Biblioteca Global y calculando unit economics...</span>
                </div>
              ) : courseAggregatedCosts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700/50">
                      <tr>
                        <th className="px-6 py-4 font-medium">Curso / Sesión</th>
                        <th className="px-4 py-4 font-medium text-right">Estructura</th>
                        <th className="px-4 py-4 font-medium text-right">Contenido</th>
                        <th className="px-4 py-4 font-medium text-right">Acciones</th>
                        <th className="px-4 py-4 font-medium text-right">Imágenes</th>
                        <th className="px-4 py-4 font-medium text-right">Voces (TTS)</th>
                        <th className="px-6 py-4 font-medium text-right">Tokens Totales</th>
                        <th className="px-6 py-4 font-medium text-right">Costo Acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {courseAggregatedCosts.map((course) => (
                        <tr key={course.stageId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-2.5 max-w-[240px]">
                              <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0 mt-0.5 border border-rose-100/50 dark:border-rose-900/20">
                                <BookOpen className="size-4 text-rose-500" />
                              </div>
                              <div className="truncate">
                                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={course.courseName}>
                                  {course.courseName}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Key className="size-3 shrink-0" />
                                  <span>{course.stageId}</span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                  <User className="size-3 shrink-0" />
                                  <span className="truncate" title={course.email}>{course.email}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                            {course.outline > 0 ? `$${course.outline.toFixed(4)}` : '—'}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                            {course.content > 0 ? `$${course.content.toFixed(4)}` : '—'}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                            {course.actions > 0 ? `$${course.actions.toFixed(4)}` : '—'}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                            {course.image > 0 ? `$${course.image.toFixed(4)}` : '—'}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                            {course.tts > 0 ? `$${course.tts.toFixed(4)}` : '—'}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs text-sky-600 dark:text-sky-400">
                            {course.totalTokens.toLocaleString(locale)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            ${course.totalCost.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
                  <Database className="size-8 text-slate-300 dark:text-slate-600" />
                  <span>No se encontraron sesiones de generación de cursos para el período seleccionado.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detailed Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t('adminUsage.detailedLog') || 'Registro Detallado'}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Mostrando {Math.min(visibleCount, logs.length)} de {logs.length}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.date') || 'Fecha'}</th>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.user') || 'Usuario'}</th>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.model') || 'Modelo'}</th>
                    <th className="px-6 py-4 font-medium">{t('adminUsage.source') || 'Origen'}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('adminUsage.promptTokens') || 'Prompt'}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('adminUsage.completionTokens') || 'Completion'}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('adminUsage.cost') || 'Costo'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <Loader2 className="size-6 animate-spin mx-auto mb-2 text-slate-400" />
                        Cargando...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        No hay registros para el periodo seleccionado.
                      </td>
                    </tr>
                  ) : (
                    logs.slice(0, visibleCount).map((log) => (
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
                            {log.model.replace('models/', '')}
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
            
            {!loading && visibleCount < logs.length && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-center bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  onClick={handleLoadMore}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-200"
                >
                  Cargar más registros
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
