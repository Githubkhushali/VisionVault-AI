import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, History, Users, MonitorPlay, Settings, HelpCircle, Shield } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/upload', icon: UploadCloud, label: 'Upload' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/face-gallery', icon: Users, label: 'Face Gallery' },
  { to: '/live-stream', icon: MonitorPlay, label: 'Live Stream' },
];

export default function Sidebar() {
  return (
    <aside className="h-screen w-64 fixed left-0 top-0 bg-[#080808]/90 backdrop-blur-xl border-r border-zinc-800 shadow-2xl z-50 flex flex-col py-6">
      {/* Logo */}
      <div className="px-6 mb-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-transparent border border-zinc-800 rounded-sm flex items-center justify-center flex-shrink-0">
            <Shield className="text-zinc-400" size={20} fill="currentColor" strokeWidth={1} />
          </div>
          <div>
            <h1 className="font-extrabold text-white leading-none text-base tracking-wider uppercase">
              VisionVault
            </h1>
            <p className="text-zinc-600 mt-1 uppercase tracking-widest text-[8px] font-bold">
              Intelligent Shield
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-3">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-3 text-[#e3e3cb] bg-[#e3e3cb]/5 border-l-2 border-[#e3e3cb] transition-all duration-200 font-bold text-xs uppercase tracking-wider'
                : 'flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all duration-200 font-bold text-xs uppercase tracking-wider'
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-[#e3e3cb]' : ''} />
                <span>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto px-4 space-y-1.5 pt-4 border-t border-zinc-900">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 transition-colors font-bold text-xs uppercase tracking-wider ${isActive ? 'text-[#e3e3cb] bg-[#e3e3cb]/5' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`
          }
        >
          <Settings size={16} />
          <span>Settings</span>
        </NavLink>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'info', message: 'Support center coming soon!' } }))}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-zinc-500 hover:text-zinc-200 transition-colors hover:bg-white/5 font-bold text-xs uppercase tracking-wider text-left"
        >
          <HelpCircle size={16} />
          <span>Support</span>
        </button>
        <button
          onClick={() => {
            localStorage.removeItem('vv_token');
            localStorage.removeItem('vv_user');
            window.location.href = '/login';
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-zinc-500 hover:text-rose-400 transition-colors hover:bg-rose-500/5 font-bold text-xs uppercase tracking-wider text-left mt-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Log Out</span>
        </button>
        <div className="mt-6 p-4 rounded-sm bg-[#e3e3cb]/5 border border-[#e3e3cb]/15">
          <p className="text-[#e3e3cb] mb-3 text-[10px] font-black uppercase tracking-widest">
            Professional License
          </p>
          <button className="w-full bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 py-2 rounded-sm font-black text-[10px] uppercase tracking-wider transition-colors shadow-md shadow-[#e3e3cb]/10">
            Upgrade to Pro
          </button>
        </div>
      </div>
    </aside>
  );
}
