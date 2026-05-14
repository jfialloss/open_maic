'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Flame, Target, Star, Calendar, BarChart3, TrendingUp } from 'lucide-react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Initialize ECharts with required components
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  SVGRenderer,
]);

export interface XpAnalyticsModalProps {
  open: boolean;
  onClose: () => void;
}

export function XpAnalyticsModal({ open, onClose }: XpAnalyticsModalProps) {
  const xpHistory = useUserProfileStore((s) => s.xpHistory) || [];
  const xpByCourse = useUserProfileStore((s) => s.xpByCourse) || {};
  const totalXP = Object.values(xpByCourse).reduce((sum, xp) => sum + xp, 0);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');

  // Prepare chart data
  const chartData = useMemo(() => {
    // 1. Filter by time range
    const now = Date.now();
    const cutoff =
      timeRange === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : timeRange === '30d'
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;

    const filtered = xpHistory.filter((h) => h.timestamp >= cutoff);

    // 2. Aggregate by day
    const dailyMap = new Map<string, number>();
    const dates = new Set<string>();

    // Generate date range
    if (filtered.length > 0) {
      const start = timeRange === 'all' ? new Date(filtered[0].timestamp) : new Date(cutoff);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = format(d, 'yyyy-MM-dd');
        dailyMap.set(dateStr, 0);
        dates.add(dateStr);
      }
    }

    filtered.forEach((h) => {
      const dateStr = format(new Date(h.timestamp), 'yyyy-MM-dd');
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + h.earned);
    });

    const sortedDates = Array.from(dates).sort();
    const dailyData = sortedDates.map((d) => dailyMap.get(d) || 0);

    // 3. Cumulative data
    let cumulative = timeRange === 'all' ? 0 : xpHistory.filter((h) => h.timestamp < cutoff).reduce((s, h) => s + h.earned, 0);
    const cumulativeData = sortedDates.map((d) => {
      cumulative += dailyMap.get(d) || 0;
      return cumulative;
    });

    // Formatting for X Axis
    const xAxisData = sortedDates.map((d) => format(new Date(d), 'MMM dd', { locale: es }));

    return { xAxisData, dailyData, cumulativeData };
  }, [xpHistory, timeRange]);

  // Metrics
  const metrics = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayEarned = xpHistory
      .filter((h) => format(new Date(h.timestamp), 'yyyy-MM-dd') === todayStr)
      .reduce((sum, h) => sum + h.earned, 0);

    return { todayEarned, totalXP, completedCourses: Object.keys(xpByCourse).length };
  }, [xpHistory, xpByCourse, totalXP]);

  // Init chart
  useEffect(() => {
    if (!open || !chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'svg' });
    }

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#1e293b' },
      },
      legend: {
        data: ['XP Diario', 'XP Total'],
        bottom: 0,
        textStyle: { color: '#64748b' }
      },
      grid: {
        top: 40,
        left: 50,
        right: 50,
        bottom: 40,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: chartData.xAxisData,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontSize: 11 },
      },
      yAxis: [
        {
          type: 'value',
          name: 'XP Diario',
          min: 0,
          position: 'left',
          axisLine: { show: true, lineStyle: { color: '#cbd5e1' } },
          axisLabel: { color: '#64748b' },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        },
        {
          type: 'value',
          name: 'Total',
          min: 0,
          position: 'right',
          axisLine: { show: false },
          axisLabel: { color: '#94a3b8' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'XP Diario',
          type: 'bar',
          data: chartData.dailyData,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#38bdf8' },
              { offset: 1, color: '#0284c7' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'XP Total',
          type: 'line',
          yAxisIndex: 1,
          data: chartData.cumulativeData,
          smooth: true,
          itemStyle: { color: '#f59e0b' },
          lineStyle: { width: 3, shadowColor: 'rgba(245, 158, 11, 0.3)', shadowBlur: 10 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0)' },
            ]),
          },
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, chartData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col ring-1 ring-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground leading-tight">Análisis de XP</h2>
              <p className="text-sm text-muted-foreground">Tu rendimiento y progreso académico</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-200 dark:shadow-none">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-amber-100 font-medium text-sm">XP Total</p>
                  <p className="text-4xl font-black mt-1">{metrics.totalXP}</p>
                </div>
                <Star className="w-8 h-8 opacity-50" />
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-border shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-muted-foreground font-medium text-sm">Ganado Hoy</p>
                  <p className="text-3xl font-bold text-foreground mt-1">+{metrics.todayEarned}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-border shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-muted-foreground font-medium text-sm">Cursos Completados</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{metrics.completedCourses}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-500" /> Historial de Crecimiento
              </h3>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                {(['7d', '30d', 'all'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-md transition-all',
                      timeRange === range
                        ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {range === '7d' ? '7 Días' : range === '30d' ? '30 Días' : 'Todo'}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full h-[300px] p-2" ref={chartRef} />
          </div>

          {/* Recent Activity */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" /> Actividad Reciente
              </h3>
            </div>
            <div className="divide-y divide-border">
              {xpHistory.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Aún no has ganado puntos. ¡Completa quizzes para empezar a sumar XP!
                </div>
              ) : (
                [...xpHistory]
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 10)
                  .map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                          <Star className="w-5 h-5 text-sky-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Evaluación Completada
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(entry.timestamp), 'dd MMM yyyy, HH:mm', { locale: es })}
                          </div>
                        </div>
                      </div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                        +{entry.earned} XP
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
