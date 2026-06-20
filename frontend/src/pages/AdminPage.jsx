import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Trash2, UserCog, Clock, Activity, Search } from 'lucide-react';
import { apiFetch } from '../utils/api'; // assuming this exists, or we use fetch with auth

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Use current user from local storage
  const currentUser = JSON.parse(localStorage.getItem('vv_user') || '{}');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vv_token');
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        setError(data.message || 'Failed to fetch users');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const token = localStorage.getItem('vv_token');
      const response = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await response.json();
      if (data.success) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: `User role updated to ${newRole}` } }));
        fetchUsers();
      } else {
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: data.message } }));
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: err.message } }));
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${userName}" and all their data? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('vv_token');
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: data.message } }));
        fetchUsers();
      } else {
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: data.message } }));
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: err.message } }));
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-sm bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/5">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin <span className="text-rose-400">Panel</span></h1>
              <p className="text-zinc-500 text-sm mt-1 uppercase tracking-widest font-bold">System Configuration & User Management</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-black border border-zinc-800 rounded-sm py-2 pl-10 pr-4 text-white placeholder-zinc-600 focus:border-rose-400 focus:ring-0 transition-colors w-64 text-sm"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-sm flex items-center gap-3">
          <ShieldAlert size={18} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-[#050505] border border-zinc-800 rounded-sm overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/50 border-b border-zinc-800">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">User</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Activity</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-zinc-500">
                    <div className="animate-pulse flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                      <p className="text-xs uppercase tracking-widest font-bold">Loading users...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-zinc-500">
                    <Shield size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No users found matching your search.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-900/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 font-bold uppercase text-xs">
                          {user.name?.slice(0, 2) || user.username?.slice(0, 2) || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-zinc-200 font-bold text-sm">{user.name}</p>
                            {user.id === currentUser.id && (
                              <span className="px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest">You</span>
                            )}
                          </div>
                          <p className="text-zinc-500 text-xs">{user.email}</p>
                          {user.username && <p className="text-zinc-600 text-[10px]">@{user.username}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.id === currentUser.id}
                        className={`bg-zinc-900 border border-zinc-800 rounded-sm text-xs font-bold px-3 py-1.5 outline-none transition-colors ${
                          user.role === 'ADMIN' ? 'text-rose-400 border-rose-500/30 focus:border-rose-400' :
                          user.role === 'SECURITY_OFFICER' ? 'text-blue-400 border-blue-500/30 focus:border-blue-400' :
                          'text-zinc-400 focus:border-[#e3e3cb]'
                        } ${user.id === currentUser.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <option value="VIEWER">Viewer</option>
                        <option value="SECURITY_OFFICER">Security Officer</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1.5" title="Data Records (Sessions / Identities)">
                          <Activity size={14} className="text-zinc-400" />
                          <span>
                            <span className="text-zinc-300 font-bold">{user.session_count + user.live_session_count}</span>
                            {' / '}
                            <span className="text-zinc-300 font-bold">{user.identity_count}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5" title={`Last Login: ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}`}>
                          <Clock size={14} className="text-zinc-400" />
                          <span>{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteUser(user.id, user.name)}
                        disabled={user.id === currentUser.id}
                        className={`p-2 rounded-sm transition-colors ${
                          user.id === currentUser.id 
                            ? 'text-zinc-700 cursor-not-allowed' 
                            : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                        }`}
                        title="Delete User"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}
