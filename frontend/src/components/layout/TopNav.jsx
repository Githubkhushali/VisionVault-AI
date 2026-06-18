import { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell, HelpCircle, User } from 'lucide-react';

const pageTitles = {
  '/': 'Dashboard',
  '/upload': 'Upload Assets',
  '/history': 'Detection History',
  '/face-gallery': 'Face Gallery',
  '/live-stream': 'Live Stream',
  '/settings': 'System Settings',
};

export default function TopNav() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Dashboard';
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef(null);

  return (
    <header className="fixed top-0 right-0 h-16 z-40 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800 shadow-sm flex justify-between items-center px-8"
      style={{ width: 'calc(100% - 16rem)', marginLeft: '16rem' }}
    >
      {/* Left: search */}
      <div className="flex items-center flex-1 gap-6">
        <h2 className="text-white font-bold text-base uppercase tracking-wider hidden lg:block">{title}</h2>
        <div
          className={`relative transition-all duration-300 ${searchFocused ? 'w-96' : 'w-80'}`}
        >
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search detections, files, or logs..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full bg-black border border-zinc-800 rounded-sm py-2 pl-11 pr-4 text-white placeholder-zinc-700 focus:border-[#e3e3cb]/50 focus:ring-0 transition-all outline-none font-mono text-xs shadow-inner tracking-wider"
          />
        </div>
      </div>

      {/* Right: links + actions */}
      <div className="flex items-center gap-6">
        {/* Docs/API/Status */}
        <div className="flex items-center gap-5 border-r border-zinc-800 pr-6">
          {['Docs', 'API', 'Status'].map((label) => (
            <a
              key={label}
              href="#"
              className="text-zinc-500 hover:text-zinc-200 transition-colors text-[10px] font-bold uppercase tracking-widest"
            >
              {label}
            </a>
          ))}
        </div>

        {/* Action icons + avatar */}
        <div className="flex items-center gap-5">
          <button onClick={() => window.location.href = '/notifications'} className="relative text-zinc-500 hover:text-zinc-200 transition-colors">
            <Bell size={18} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-[#050505]" />
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'info', message: 'Support center coming soon!' } }))} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <HelpCircle size={18} />
          </button>
          {/* Avatar */}
          <div onClick={() => window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'info', message: 'User profile coming soon!' } }))} className="w-9 h-9 rounded-sm border border-zinc-800 overflow-hidden cursor-pointer hover:border-[#e3e3cb] transition-colors bg-[#e3e3cb]/10 flex items-center justify-center text-[#e3e3cb]">
            <User size={16} />
          </div>
        </div>
      </div>
    </header>
  );
}
