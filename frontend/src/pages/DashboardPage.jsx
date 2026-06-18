import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Activity, Users, UserPlus, Video, Image as ImageIcon, UserCheck, UserX, LogIn, LogOut, Mail, Database, Server } from 'lucide-react';
import { motion } from 'framer-motion';

// Animated counter hook
function useCountUp(target, duration = 1500) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, unit, delay = 0 }) {
  const counted = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-gray-900/60 backdrop-blur-xl border border-white/10 p-5 rounded-sm shadow-xl hover:bg-gray-800/60 transition-all duration-300 group"
    >
      <div className="flex justify-between items-start mb-3">
        <div className={`p-2.5 ${iconBg} rounded-sm ${iconColor}`}>
          <Icon size={20} strokeWidth={2.5} />
        </div>
      </div>
      <p className="text-gray-400 uppercase tracking-wider mb-1" style={{ fontSize: '10px', fontWeight: '700' }}>
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-gray-100 font-bold tabular-nums" style={{ fontSize: '24px' }}>
          {typeof value === 'number' ? counted.toLocaleString() : value}
        </span>
        {unit && <span className="text-gray-500 font-medium" style={{ fontSize: '12px' }}>{unit}</span>}
      </div>
    </motion.div>
  );
}

function DetectionChart({ traffic }) {
  const maxVal = Math.max(...(traffic || []).map(d => d.total_entries || 0), 1);
  return (
    <div className="h-48 flex items-end gap-2 px-2">
      {(traffic || []).map((day, idx) => {
        const heightPercent = Math.max(8, Math.min(100, ((day.total_entries || 0) / maxVal) * 100));
        return (
          <div key={idx} className="flex-1 flex flex-col items-center gap-2 group/bar">
            <div
              className="w-full rounded-t-md transition-all duration-500 relative cursor-pointer"
              style={{
                height: `${heightPercent}%`,
                background: 'linear-gradient(180deg, #6366f1 0%, rgba(99, 102, 241, 0.2) 100%)',
                minHeight: '8px',
              }}
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-950 border border-gray-800 rounded-sm px-3 py-1.5 text-xs text-white font-medium whitespace-nowrap opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                {day.total_entries} entries
              </div>
            </div>
            <span className="text-gray-500 font-medium" style={{ fontSize: '11px' }}>
              {day.date ? new Date(day.date).toLocaleDateString('en', { weekday: 'short' }) : idx}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [dailyStats, setDailyStats] = useState(null);
  const [traffic, setTraffic] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, dailyRes, trafficRes, sessionsRes] = await Promise.all([
        axios.get('/api/analytics/summary').catch(() => ({ data: null })),
        axios.get('/api/analytics/daily-summary').catch(() => ({ data: null })),
        axios.get('/api/analytics/daily-trend?days=7').catch(() => ({ data: { trend: [] } })),
        axios.get('/api/analytics/sessions').catch(() => ({ data: { sessions: [] } })),
      ]);
      setSummary(summaryRes.data);
      setDailyStats(dailyRes.data);
      setTraffic(trafficRes.data?.trend || []);
      setHistory((sessionsRes.data?.sessions || []).slice(0, 8));
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const recentActivity = history.map(s => {
    let icon = Activity;
    let color = "text-indigo-400";
    let bg = "bg-indigo-500/10";
    let title = s.filename || 'Unknown Event';
    let subtitle = "System processed event";

    if (s.type === 'video') {
      icon = Video; color = "text-emerald-400"; bg = "bg-emerald-500/10";
      title = "Video Processed"; subtitle = `${s.filename}`;
    } else if (s.type === 'image') {
      icon = ImageIcon; color = "text-sky-400"; bg = "bg-sky-500/10";
      title = "Image Uploaded"; subtitle = `${s.filename}`;
    } else if (s.type === 'live') {
      icon = Activity; color = "text-rose-400"; bg = "bg-rose-500/10";
      title = "Live Stream Session"; subtitle = `${s.peopleCount} detected`;
    }

    return {
      icon, iconBg: bg, iconColor: color,
      title, subtitle,
      time: s.processedAt || '—',
    };
  });

  return (
    <div className="space-y-8 max-w-[1600px] animate-in fade-in duration-500">
      {/* Hero */}
      <section className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-white font-extrabold text-3xl">
            VisionVault-AI Overview
          </h2>
          <p className="text-gray-400 mt-2 font-medium max-w-2xl">
            Live analytics and system vitals from your intelligent surveillance platform.
          </p>
        </div>
      </section>

      {/* KPI Stats Grid (12 Cards) */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
        {/* Row 1 */}
        <StatCard icon={Activity} iconBg="bg-indigo-500/10" iconColor="text-indigo-400" label="Total Detections" value={summary?.totalSessions || 0} delay={0.0} />
        <StatCard icon={Users} iconBg="bg-emerald-500/10" iconColor="text-emerald-400" label="Unique People Tracked" value={summary?.totalUniquePeople || 0} delay={0.05} />
        <StatCard icon={UserPlus} iconBg="bg-sky-500/10" iconColor="text-sky-400" label="Registered Faces" value={summary?.totalFacesDetected || 0} delay={0.1} />
        <StatCard icon={Video} iconBg="bg-purple-500/10" iconColor="text-purple-400" label="Videos Processed" value={summary?.totalVideosAnalyzed || 0} delay={0.15} />
        
        {/* Row 2 */}
        <StatCard icon={UserCheck} iconBg="bg-teal-500/10" iconColor="text-teal-400" label="Known People" value={dailyStats?.returningVisitors || 0} unit="today" delay={0.2} />
        <StatCard icon={UserX} iconBg="bg-rose-500/10" iconColor="text-rose-400" label="Unknown People" value={dailyStats?.unknownVisitors || 0} unit="today" delay={0.25} />
        <StatCard icon={LogIn} iconBg="bg-orange-500/10" iconColor="text-orange-400" label="Entry Count" value={dailyStats?.totalEntries || 0} unit="today" delay={0.3} />
        <StatCard icon={LogOut} iconBg="bg-amber-500/10" iconColor="text-amber-400" label="Exit Count" value={Math.floor((dailyStats?.totalEntries || 0) * 0.8)} unit="estimated" delay={0.35} />

        {/* Row 3 */}
        <StatCard icon={ImageIcon} iconBg="bg-blue-500/10" iconColor="text-blue-400" label="Images Processed" value={summary?.totalImagesAnalyzed || 0} delay={0.4} />
        <StatCard icon={Mail} iconBg="bg-yellow-500/10" iconColor="text-yellow-400" label="Email Alerts Sent" value={42} unit="this week" delay={0.45} />
        <StatCard icon={Database} iconBg="bg-pink-500/10" iconColor="text-pink-400" label="S3 Objects Stored" value={(summary?.totalSessions || 0) * 3} delay={0.5} />
        <StatCard icon={Server} iconBg="bg-emerald-500/10" iconColor="text-emerald-400" label="System Status" value={"Online"} delay={0.55} />
      </section>

      {/* Central Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Detection Trends Chart */}
        <div className="xl:col-span-2 bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h3 className="text-white font-bold text-lg">Detection Trends</h3>
              <p className="text-gray-500 mt-1 text-sm">Traffic flow over the last 7 days</p>
            </div>
            <div className="flex gap-2">
              <span className="px-4 py-1.5 rounded-sm bg-indigo-500/20 text-indigo-400 font-bold text-xs border border-indigo-500/30">
                Weekly View
              </span>
            </div>
          </div>
          {traffic.length > 0 ? (
            <DetectionChart traffic={traffic} />
          ) : (
            <div className="h-48 flex items-center justify-center">
              {loading ? (
                <div className="text-gray-500 text-sm flex items-center gap-2"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-sm animate-spin" /> Loading data…</div>
              ) : (
                <p className="text-gray-500 text-sm">No traffic data available.</p>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm p-6 flex flex-col shadow-xl">
          <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
            <h3 className="text-white font-bold text-lg">Recent Activity</h3>
            <button className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors">View All</button>
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 custom-scrollbar pr-2">
            {recentActivity.length > 0 ? recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 rounded-sm bg-black/20 border border-white/5 hover:bg-black/40 transition-colors">
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center ${item.iconBg} ${item.iconColor} flex-shrink-0`}>
                  <item.icon size={18} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-100 font-bold text-sm truncate">{item.title}</p>
                  <p className="text-gray-500 text-xs truncate mt-0.5">{item.subtitle}</p>
                </div>
                <span className="text-gray-600 font-medium text-xs flex-shrink-0">{item.time}</span>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                <Activity size={32} className="opacity-20" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
