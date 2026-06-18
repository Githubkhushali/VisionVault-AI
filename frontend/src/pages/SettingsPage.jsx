import React, { useState, useEffect } from 'react';
import { Save, Bell, Shield, Camera, Server, Moon, Sun, Mail } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    detectionThreshold: 60,
    darkMode: true,
    emailAlerts: false,
    alertEmail: '',
    awsRegion: '',
    awsBucket: '',
    cameraDevice: 'default'
  });

  useEffect(() => {
    const saved = localStorage.getItem('visionvault_settings');
    if (saved) {
      try { setSettings(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSave = () => {
    localStorage.setItem('visionvault_settings', JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Settings saved successfully!' } }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
             <Shield className="text-indigo-500" size={32} /> System Settings
          </h1>
          <p className="text-gray-400 mt-2 font-medium">Configure detection thresholds, cloud storage, and alerts.</p>
        </div>
        <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all">
          <Save size={18} /> Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Detection Settings */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm p-6 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
             <Camera className="text-indigo-400" size={20} /> Recognition Engine
          </h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-gray-300">Confidence Threshold</label>
                <span className="text-sm font-mono text-indigo-400">{settings.detectionThreshold}%</span>
              </div>
              <input 
                type="range" min="10" max="99" 
                name="detectionThreshold" value={settings.detectionThreshold} onChange={handleChange}
                className="w-full accent-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum confidence required to log an identity.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">Default Camera Source</label>
              <select name="cameraDevice" value={settings.cameraDevice} onChange={handleChange} className="w-full bg-black/40 border border-white/10 rounded-sm py-2.5 px-3 text-sm text-white outline-none focus:border-indigo-500/50">
                <option value="default">Default System Camera</option>
                <option value="usb">USB WebCamera</option>
                <option value="ip">IP Camera Stream</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cloud & Storage */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm p-6 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
             <Server className="text-teal-400" size={20} /> Cloud Integration (AWS S3)
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">AWS Region</label>
              <input type="text" name="awsRegion" value={settings.awsRegion} onChange={handleChange} placeholder="e.g. us-east-1" className="w-full bg-black/40 border border-white/10 rounded-sm py-2 px-3 text-sm text-white outline-none focus:border-teal-500/50 placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">S3 Bucket Name</label>
              <input type="text" name="awsBucket" value={settings.awsBucket} onChange={handleChange} placeholder="visionvault-images" className="w-full bg-black/40 border border-white/10 rounded-sm py-2 px-3 text-sm text-white outline-none focus:border-teal-500/50 placeholder-gray-600" />
            </div>
            <p className="text-xs text-amber-500/80 bg-amber-500/10 p-2 rounded-sm border border-amber-500/20">AWS Access Keys are securely managed via the backend `.env` file and cannot be modified here.</p>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm p-6 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
             <Bell className="text-orange-400" size={20} /> Alerts & Notifications
          </h2>
          <div className="space-y-6">
            <label className="flex items-center justify-between cursor-pointer group">
              <div>
                <p className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">Email Alerts for Unknown Persons</p>
                <p className="text-xs text-gray-500 mt-0.5">Receive instant alerts when unrecognized faces appear.</p>
              </div>
              <div className="relative">
                <input type="checkbox" name="emailAlerts" checked={settings.emailAlerts} onChange={handleChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </div>
            </label>
            {settings.emailAlerts && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Mail size={16} /></span>
                  <input type="email" name="alertEmail" value={settings.alertEmail} onChange={handleChange} placeholder="security@enterprise.com" className="w-full bg-black/40 border border-white/10 rounded-sm py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-orange-500/50 placeholder-gray-600" />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm p-6 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
             <Sun className="text-yellow-400" size={20} /> Appearance
          </h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer group">
              <div>
                <p className="text-sm font-bold text-gray-200 flex items-center gap-2 group-hover:text-white transition-colors">
                  <Moon size={16} className="text-indigo-400" /> Force Dark Mode
                </p>
                <p className="text-xs text-gray-500 mt-0.5">The application is currently optimized for dark mode.</p>
              </div>
              <div className="relative opacity-50 cursor-not-allowed">
                <input type="checkbox" checked disabled className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
