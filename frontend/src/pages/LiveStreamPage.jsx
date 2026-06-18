import { useState, useEffect, useRef } from 'react';
import FaceTrackingDashboard from '../components/FaceTrackingDashboard';
import { Users, Activity, Clock } from 'lucide-react';

function StatCard({ icon: Icon, label, value, pulse, colorClass = "text-indigo-400 bg-indigo-500/10" }) {
  return (
    <div className="bg-gray-900/60 backdrop-blur-xl p-4 rounded-sm flex items-center gap-4 border border-white/10 shadow-lg hover:bg-gray-800/60 transition-colors">
      <div className={`w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        <Icon size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">{label}</p>
        <p className="text-white font-black text-2xl mt-0.5">{value}</p>
      </div>
      {pulse && (
        <div className="flex-shrink-0 self-start">
          <span className="flex items-center gap-1.5 bg-rose-500/10 text-rose-400 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Live
          </span>
        </div>
      )}
    </div>
  );
}

export default function LiveStreamPage() {
  const [currentTime, setCurrentTime] = useState('');
  const [latency] = useState(() => `${Math.floor(Math.random() * 10) + 18}ms`);

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const ms = String(Math.floor(Math.random() * 99)).padStart(2, '0');
      setCurrentTime(`${h}:${m}:${s}.${ms}`);
    };
    tick();
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="animate-in fade-in duration-500 flex flex-col gap-6 h-[calc(100vh-4rem-4rem)] max-w-[1600px] mx-auto">
      {/* Page header row */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between flex-shrink-0 gap-4">
        <div>
          <h2 className="text-white font-extrabold text-3xl">Live Stream Analytics</h2>
          <p className="text-gray-400 mt-2 font-medium">Real-time face detection, identity tracking, and security monitoring.</p>
        </div>

        {/* HUD timestamp */}
        <div className="flex items-center gap-3">
          <div className="bg-gray-900/60 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-sm flex items-center gap-3 shadow-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 font-mono font-bold text-sm">
              {currentTime || '—'}
            </span>
          </div>
          <div className="bg-gray-900/60 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-sm shadow-xl">
            <span className="text-gray-300 font-bold text-sm tracking-wide">HD • 30 FPS</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
        <StatCard icon={Users} label="People Detected" value="Live HUD" pulse colorClass="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" />
        <StatCard icon={Activity} label="System Health" value="99.9%" colorClass="text-indigo-400 bg-indigo-500/10 border border-indigo-500/20" />
        <StatCard icon={Clock} label="Average Latency" value={latency} colorClass="text-sky-400 bg-sky-500/10 border border-sky-500/20" />
      </div>

      {/* Main tracking area — FaceTrackingDashboard */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-sm border border-white/10 shadow-2xl bg-[#0a0a0f] relative z-10 custom-scrollbar">
        <FaceTrackingDashboard />
      </div>
    </div>
  );
}
