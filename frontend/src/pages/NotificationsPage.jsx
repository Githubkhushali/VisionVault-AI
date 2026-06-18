import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bell, Info, AlertTriangle, AlertOctagon, CheckCircle2, Search, Filter, Play, RefreshCw, Trash2, Check } from 'lucide-react';

const SEVERITY_STYLES = {
  INFO: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  WARNING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  HIGH: 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
};

const SEVERITY_ICONS = {
  INFO: Info,
  WARNING: AlertTriangle,
  HIGH: AlertOctagon,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('ALL'); // ALL, UNREAD, HIGH

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vv_token');
      const res = await axios.get('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setNotifications(res.data.notifications || []);
      }
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: 'Failed to load notifications' } }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    try {
      const token = localStorage.getItem('vv_token');
      await axios.post('/api/notifications/read', { notificationIds: [id] }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_status: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_status).map(n => n.id);
    if (!unreadIds.length) return;
    try {
      const token = localStorage.getItem('vv_token');
      await axios.post('/api/notifications/read', { notificationIds: unreadIds }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, read_status: true })));
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'All marked as read' } }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('vv_token');
      await axios.delete(`/api/notifications/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Notification deleted' } }));
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = notifications.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase()) || n.message.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'ALL' || (filter === 'UNREAD' && !n.read_status) || (filter === 'HIGH' && n.severity === 'HIGH');
    return matchesSearch && matchesFilter;
  });

  const unreadCount = notifications.filter(n => !n.read_status).length;

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-white font-extrabold text-3xl flex items-center gap-3">
            <Bell className="text-indigo-400" size={32} /> System Alerts
          </h2>
          <p className="text-gray-400 mt-2 font-medium">Review unhandled security alerts, entry events, and system notices.</p>
        </div>
        <div className="flex gap-3">
          {unreadCount > 0 && (
            <button onClick={handleMarkAllAsRead} className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-white/10 text-white font-bold hover:bg-white/10 transition-colors text-sm">
              <Check size={16} /> Mark all read
            </button>
          )}
          <button onClick={fetchNotifications} className="flex items-center gap-2 px-4 py-2.5 rounded-sm bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-colors text-sm shadow-lg shadow-indigo-500/20">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats/Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900/60 backdrop-blur-xl p-4 rounded-sm border border-white/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-sm bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
            <Bell size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total</p>
            <p className="text-2xl font-black text-white">{notifications.length}</p>
          </div>
        </div>
        <div className="bg-gray-900/60 backdrop-blur-xl p-4 rounded-sm border border-white/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-sm bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Unread</p>
            <p className="text-2xl font-black text-amber-400">{unreadCount}</p>
          </div>
        </div>
        
        <div className="col-span-1 md:col-span-2 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text" 
              placeholder="Search messages..." 
              value={search}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-full bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm pl-10 pr-4 text-white text-sm font-medium focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <div className="relative w-40">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full h-full bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm pl-10 pr-4 text-white text-sm font-medium focus:outline-none appearance-none cursor-pointer"
            >
              <option value="ALL" className="bg-gray-900">All Alerts</option>
              <option value="UNREAD" className="bg-gray-900">Unread Only</option>
              <option value="HIGH" className="bg-gray-900">High Severity</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {loading && notifications.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-900/40 rounded-sm border border-white/5 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-gray-900/40 border border-white/5 rounded-sm p-16 flex flex-col items-center justify-center text-gray-500">
            <CheckCircle2 size={48} className="mb-4 opacity-20" />
            <p className="font-bold">You're all caught up!</p>
            <p className="text-sm mt-1">No notifications matching your criteria.</p>
          </div>
        ) : (
          filtered.map((n) => {
            const Icon = SEVERITY_ICONS[n.severity] || Info;
            const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.INFO;
            
            return (
              <div key={n.id} className={`relative bg-gray-900/60 backdrop-blur-xl rounded-sm p-5 border transition-all duration-300 ${n.read_status ? 'border-white/5 opacity-70' : 'border-white/10 shadow-lg'}`}>
                {!n.read_status && (
                  <div className="absolute top-5 right-5 w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                )}
                
                <div className="flex gap-4">
                  <div className={`w-12 h-12 rounded-sm flex items-center justify-center shrink-0 border ${style}`}>
                    <Icon size={24} />
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase border ${style}`}>
                        {n.type.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-mono text-gray-500">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <h3 className={`text-base font-bold truncate ${n.read_status ? 'text-gray-300' : 'text-white'}`}>
                      {n.title}
                    </h3>
                    <p className={`text-sm mt-1 ${n.read_status ? 'text-gray-500' : 'text-gray-400'}`}>
                      {n.message}
                    </p>
                    
                    <div className="flex gap-3 mt-4">
                      {!n.read_status && (
                        <button onClick={() => handleMarkAsRead(n.id)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors">
                          <Check size={14} /> Mark Read
                        </button>
                      )}
                      <button onClick={() => handleDelete(n.id)} className="text-xs font-bold text-gray-500 hover:text-rose-400 flex items-center gap-1.5 transition-colors">
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
