import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, History, Users, MonitorPlay, Settings, HelpCircle, Shield, LogOut, ShieldAlert } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/upload', icon: UploadCloud, label: 'Upload' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/face-gallery', icon: Users, label: 'Face Gallery' },
  { to: '/live-stream', icon: MonitorPlay, label: 'Live Stream' },
];

function useCurrentUser() {
  try {
    const raw = localStorage.getItem('vv_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Sidebar() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isAdmin = user?.role === 'ADMIN';

  const handleLogout = () => {
    localStorage.removeItem('vv_token');
    localStorage.removeItem('vv_user');
    navigate('/login', { replace: true });
  };

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
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Admin Panel link — only shown to admins */}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-3 text-rose-400 bg-rose-500/5 border-l-2 border-rose-400 transition-all duration-200 font-bold text-xs uppercase tracking-wider'
                : 'flex items-center gap-3 px-4 py-3 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/5 transition-all duration-200 font-bold text-xs uppercase tracking-wider'
            }
          >
            {({ isActive }) => (
              <>
                <ShieldAlert size={16} className={isActive ? 'text-rose-400' : ''} />
                <span>Admin Panel</span>
              </>
            )}
          </NavLink>
        )}
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
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-zinc-500 hover:text-rose-400 transition-colors hover:bg-rose-500/5 font-bold text-xs uppercase tracking-wider text-left mt-1"
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>

        {/* User info card */}
        {user && (
          <div className="mt-4 p-3 rounded-sm bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-6 h-6 rounded-sm bg-[#e3e3cb]/10 border border-[#e3e3cb]/20 flex items-center justify-center flex-shrink-0">
                <Shield size={11} className="text-[#e3e3cb]" />
              </div>
              <div className="min-w-0">
                <p className="text-zinc-300 font-bold text-[10px] truncate">{user.name || user.username || 'Operator'}</p>
                <p className="text-zinc-600 text-[8px] font-bold uppercase tracking-widest truncate">
                  {user.role || 'VIEWER'}
                  {isAdmin && <span className="ml-1 text-rose-400">● ADMIN</span>}
                </p>
              </div>
            </div>
            <p className="text-zinc-600 text-[8px] truncate">{user.email}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
