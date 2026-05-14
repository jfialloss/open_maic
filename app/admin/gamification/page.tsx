'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowLeft, Search, User, Star, Trophy, Target, BarChart3, X, Calendar } from 'lucide-react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  SVGRenderer,
]);

type TimeRange = '7d' | '30d' | 'this_month' | 'all' | 'custom';

interface XPHistoryEvent {
  timestamp: number;
  courseId: string;
  earned: number;
}

interface StudentXPProfile {
  uid: string;
  email: string;
  nickname: string;
  grade: string;
  englishLevel: string;
  xpHistory: XPHistoryEvent[];
  totalXP: number; // Historical total
  rangeXP: number; // XP within selected range
}

export default function AdminGamificationPage() {
  const { role, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [students, setStudents] = useState<StudentXPProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [customStart, setCustomStart] = useState<string>(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [selectedGrade, setSelectedGrade] = useState<string>('Todos');
  const [selectedStudent, setSelectedStudent] = useState<StudentXPProfile | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const studentChartRef = useRef<HTMLDivElement>(null);
  const studentChartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'tutor') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  // Fetch all students and their profiles
  useEffect(() => {
    const fetchGamificationData = async () => {
      if (role !== 'admin' && role !== 'tutor') return;
      try {
        setLoading(true);
        const usersQ = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnap = await getDocs(usersQ);

        const loadedStudents: StudentXPProfile[] = [];

        for (const userDoc of usersSnap.docs) {
          const userData = userDoc.data();
          const uid = userDoc.id;

          const profileSnap = await getDoc(doc(db, 'users', uid, 'data', 'profile'));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            const xpByCourse = profileData.xpByCourse || {};
            const xpHistory = profileData.xpHistory || [];
            const grade = profileData.grade || 'Sin Asignar';
            const englishLevel = profileData.englishLevel || 'A1';

            const email = userData.email || 'N/A';
            const fullName = userData.displayName || profileData.nickname || (email !== 'N/A' ? email.split('@')[0] : 'Anónimo');
            
            const totalXP = Object.values(xpByCourse).reduce((sum: any, xp: any) => sum + xp, 0) as number;

            loadedStudents.push({
              uid,
              email,
              nickname: fullName,
              grade,
              englishLevel,
              xpHistory,
              totalXP,
              rangeXP: 0 // Will be calculated based on filters
            });
          }
        }

        setStudents(loadedStudents);
      } catch (err) {
        console.error('Failed to fetch gamification data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchGamificationData();
    }
  }, [authLoading, role]);

  // Derived Data & Filtering
  const { filteredStudents, metrics, dailyGlobalData, xAxisDates } = useMemo(() => {
    const now = Date.now();
    let cutoff = 0;
    let endCutoff = now;

    if (timeRange === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    else if (timeRange === 'this_month') {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      cutoff = d.getTime();
    } else if (timeRange === 'custom') {
      const dStart = new Date(customStart + 'T00:00:00');
      cutoff = dStart.getTime();

      const dEnd = new Date(customEnd + 'T23:59:59');
      endCutoff = dEnd.getTime();
    }

    // Process Date Range for charts
    const datesMap = new Map<string, number>();
    const dates = new Set<string>();
    
    const startObj = new Date(timeRange === 'all' ? subDays(new Date(), 30) : cutoff);
    startObj.setHours(0,0,0,0);
    const endObj = new Date(endCutoff);
    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
      const dStr = format(d, 'yyyy-MM-dd');
      datesMap.set(dStr, 0);
      dates.add(dStr);
    }

    let globalRangeXP = 0;

    const mapped = students.map(s => {
      let rangeXP = 0;
      s.xpHistory.forEach(h => {
        if (h.timestamp >= cutoff && h.timestamp <= endCutoff) {
          rangeXP += h.earned;
          const dStr = format(new Date(h.timestamp), 'yyyy-MM-dd');
          if (datesMap.has(dStr)) {
            datesMap.set(dStr, datesMap.get(dStr)! + h.earned);
            globalRangeXP += h.earned;
          }
        }
      });
      return { ...s, rangeXP };
    });

    const filtered = mapped.filter(s => {
      const matchQuery = s.nickname.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         s.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchGrade = selectedGrade === 'Todos' || s.grade === selectedGrade;
      return matchQuery && matchGrade;
    }).sort((a, b) => b.rangeXP - a.rangeXP || b.totalXP - a.totalXP); // Sort by rangeXP desc

    const sortedDates = Array.from(dates).sort();
    const dailyData = sortedDates.map(d => datesMap.get(d) || 0);
    const formattedDates = sortedDates.map(d => format(new Date(d), 'MMM dd', { locale: es }));

    const topStudent = filtered[0];
    const numDays = Math.max(1, sortedDates.length);

    return {
      filteredStudents: filtered.map(s => ({ ...s, avgDailyXP: Math.round(s.rangeXP / numDays) })),
      metrics: {
        globalRangeXP,
        activeStudents: filtered.filter(s => s.rangeXP > 0).length,
        avgXP: filtered.length > 0 ? Math.round(globalRangeXP / filtered.length) : 0,
        topStudentName: topStudent && topStudent.rangeXP > 0 ? topStudent.nickname : 'N/A'
      },
      dailyGlobalData: dailyData,
      xAxisDates: formattedDates
    };
  }, [students, timeRange, searchQuery, selectedGrade, customStart, customEnd]);

  // Global Chart Effect
  useEffect(() => {
    if (loading || !chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'svg' });
    }

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        textStyle: { color: '#1e293b' },
      },
      grid: { top: 30, left: 40, right: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: xAxisDates,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { color: '#64748b' },
      },
      series: [
        {
          name: 'XP Generado',
          type: 'bar',
          data: dailyGlobalData,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#f59e0b' },
              { offset: 1, color: '#d97706' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        }
      ]
    };

    chartInstance.current.setOption(option);
    const resize = () => chartInstance.current?.resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [loading, dailyGlobalData, xAxisDates]);

  // Student Detail Chart Effect
  useEffect(() => {
    if (!selectedStudent || !studentChartRef.current) return;

    if (!studentChartInstance.current) {
      studentChartInstance.current = echarts.init(studentChartRef.current, null, { renderer: 'svg' });
    }

    // Extract student data (last 30 days)
    const datesMap = new Map<string, number>();
    const endObj = new Date();
    const startObj = subDays(endObj, 30);
    startObj.setHours(0,0,0,0);
    
    const dates = new Set<string>();
    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
      const dStr = format(d, 'yyyy-MM-dd');
      datesMap.set(dStr, 0);
      dates.add(dStr);
    }

    selectedStudent.xpHistory.forEach(h => {
      if (h.timestamp >= startObj.getTime()) {
        const dStr = format(new Date(h.timestamp), 'yyyy-MM-dd');
        if (datesMap.has(dStr)) {
          datesMap.set(dStr, datesMap.get(dStr)! + h.earned);
        }
      }
    });

    const sortedDates = Array.from(dates).sort();
    const data = sortedDates.map(d => datesMap.get(d) || 0);
    const xLabels = sortedDates.map(d => format(new Date(d), 'MMM dd', { locale: es }));

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 20, left: 40, right: 20, bottom: 20 },
      xAxis: { type: 'category', data: xLabels, axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
      series: [{
        name: 'XP',
        type: 'bar',
        data,
        itemStyle: { color: '#0ea5e9', borderRadius: [2, 2, 0, 0] }
      }]
    };

    studentChartInstance.current.setOption(option);
  }, [selectedStudent]);

  if (authLoading || (role !== 'admin' && role !== 'tutor')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const uniqueGrades = Array.from(new Set(students.map(s => s.grade))).sort();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="size-4" />
          Volver
        </button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center border border-amber-200 dark:border-amber-800/50">
              <Star className="size-6 text-amber-600 dark:text-amber-400 fill-amber-500/20" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Reporte de Gamificación
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Monitorea el XP y el compromiso académico de los estudiantes.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar alumno..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-shadow dark:text-slate-200"
            />
          </div>
          
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-slate-200 outline-none"
          >
            <option value="Todos">Todos los Grados</option>
            {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
            {(['7d', '30d', 'this_month', 'all', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  timeRange === r
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                )}
              >
                {r === '7d' ? '7 Días' : r === '30d' ? '30 Días' : r === 'this_month' ? 'Mes Actual' : r === 'all' ? 'Todo' : 'Personalizado'}
              </button>
            ))}
          </div>

          {timeRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-slate-200 dark:[color-scheme:dark]"
              />
              <span className="text-slate-500 dark:text-slate-400 text-sm">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-slate-200 dark:[color-scheme:dark]"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="size-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Top Metrics & Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="size-4 text-slate-400" />
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200">XP Generado Global (Rango)</h3>
                </div>
                <div className="w-full h-[200px]" ref={chartRef} />
              </div>

              <div className="flex flex-col gap-4">
                <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-200 dark:shadow-none flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-amber-100 font-medium text-sm">XP Total Generado</p>
                      <p className="text-4xl font-black mt-1">{metrics.globalRangeXP}</p>
                    </div>
                    <Star className="w-8 h-8 opacity-50" />
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Promedio de XP por alumno</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{metrics.avgXP}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Alumno Destacado</p>
                  <p className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1 truncate">{metrics.topStudentName}</p>
                </div>
              </div>
            </div>

            {/* Leaderboard Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Trophy className="size-4 text-amber-500" /> Leaderboard
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50/50 dark:bg-slate-800/20 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-3 w-16 text-center">#</th>
                      <th className="px-6 py-3">Alumno</th>
                      <th className="px-6 py-3">Grado</th>
                      <th className="px-6 py-3 text-right">XP (Rango)</th>
                      <th className="px-6 py-3 text-right">Promedio / Día</th>
                      <th className="px-6 py-3 text-right">XP Histórico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          No se encontraron estudiantes o no hay actividad en este periodo.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student, idx) => (
                        <tr 
                          key={student.uid} 
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                          onClick={() => setSelectedStudent(student)}
                        >
                          <td className="px-6 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center size-6 rounded-full font-bold text-xs",
                              idx === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                              idx === 1 ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300" :
                              idx === 2 ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" :
                              "text-slate-400"
                            )}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <User className="size-4 text-slate-500" />
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">{student.nickname}</div>
                                <div className="text-xs text-slate-500">{student.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700">
                                {student.grade}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-bold text-amber-600 dark:text-amber-400 text-lg">
                              +{student.rangeXP}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-medium text-slate-500 dark:text-slate-400">
                              {student.avgDailyXP}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {student.totalXP}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStudent(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground leading-tight">{selectedStudent.nickname}</h2>
                    <p className="text-sm text-muted-foreground">{selectedStudent.grade}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">XP Histórico</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{selectedStudent.totalXP} <Star className="inline size-4 text-amber-500 -mt-1"/></p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Rango Activo (+)</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">+{selectedStudent.rangeXP}</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4">
                  <h3 className="text-sm font-bold text-foreground mb-4">Actividad Diaria (Últimos 30 días)</h3>
                  <div className="w-full h-[200px]" ref={studentChartRef} />
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-bold text-foreground">Registro de XP (Últimos 10)</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {selectedStudent.xpHistory.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">Sin registros.</div>
                    ) : (
                      [...selectedStudent.xpHistory]
                        .sort((a,b) => b.timestamp - a.timestamp)
                        .slice(0, 10)
                        .map((entry, i) => (
                          <div key={i} className="px-4 py-3 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/20">
                            <div className="flex items-center gap-2 text-sm text-foreground">
                              <Target className="size-4 text-sky-500" />
                              <span>Evaluación / Quiz</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">+{entry.earned} XP</span>
                              <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                                <Calendar className="size-3" />
                                {format(new Date(entry.timestamp), 'dd MMM yyyy HH:mm', { locale: es })}
                              </p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
