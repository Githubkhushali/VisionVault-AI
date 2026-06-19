import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Fingerprint, Loader2, Eye, EyeOff, ArrowLeft, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import axios from 'axios';

function PasswordStrengthBar({ password }) {
  const checks = [
    { label: 'At least 6 characters', ok: password.length >= 6 },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Contains special char', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${i < strength ? colors[strength - 1] : 'bg-zinc-800'}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map((c, i) => (
          <span key={i} className={`text-[9px] uppercase tracking-wide flex items-center gap-1 ${c.ok ? 'text-emerald-500' : 'text-zinc-700'}`}>
            {c.ok ? <CheckCircle size={9} /> : <XCircle size={9} />}
            {c.label}
          </span>
        ))}
      </div>
      {strength > 0 && (
        <span className={`text-[9px] font-black uppercase tracking-widest ${colors[strength - 1].replace('bg-', 'text-')}`}>
          Strength: {labels[strength - 1]}
        </span>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const navigate = useNavigate();

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const toast = (type, message) => {
    window.dispatchEvent(new CustomEvent('toast', { detail: { type, message } }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!form.name || !form.email || !form.password || !form.confirm) {
      setErrorMsg('All fields are required.');
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg('Passwords do not match. Please try again.');
      return;
    }
    if (form.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.post('/api/auth/register', {
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      if (res.data.success) {
        setSuccessMsg(`Account created! Your username is "${res.data.username}". Redirecting to login...`);
        toast('success', 'Account created successfully!');
        setTimeout(() => navigate('/login'), 2500);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Registration failed. Please try again.';
      setErrorMsg(msg);
      toast('error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen font-mono flex flex-col justify-center items-center p-6 relative overflow-hidden"
      style={{ background: 'radial-gradient(circle at center, #0c101b 0%, #030407 100%)' }}
    >
      <style>{`
        @keyframes scan {
          0% { top: 0%; } 50% { top: 100%; } 100% { top: 0%; }
        }
        .tech-scanner-line {
          position: absolute; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(227,227,203,0.3), transparent);
          box-shadow: 0 0 8px 1px #e3e3cb;
          animation: scan 5s ease-in-out infinite; pointer-events: none; z-index: 10;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
      `}</style>

      {/* Back link */}
      <div className="w-full max-w-md mb-4">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-[9px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-black transition-colors">
          <ArrowLeft size={11} />
          BACK_TO_LOGIN
        </Link>
      </div>

      {/* Card */}
      <div className="border border-zinc-800 bg-[#0c0c0c] rounded-sm p-8 w-full max-w-md relative overflow-hidden">
        {/* Corner crosshairs */}
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-zinc-700" />
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-zinc-700" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-zinc-700" />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-zinc-700" />
        <div className="tech-scanner-line" />

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 border border-zinc-800 rounded-sm flex items-center justify-center bg-black/40 text-zinc-300">
            <ShieldCheck size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-widest uppercase">Create Account</h1>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">REGISTER NEW OPERATOR</p>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">

          {/* Error */}
          {errorMsg && (
            <div className="fade-in flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-sm p-3">
              <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-red-300 leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Success */}
          {successMsg && (
            <div className="fade-in flex items-start gap-2 bg-emerald-950/40 border border-emerald-900/60 rounded-sm p-3">
              <CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-emerald-300 leading-relaxed">{successMsg}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Full Name</label>
            <input
              id="reg-name"
              type="text"
              value={form.name}
              onChange={set('name')}
              className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3 px-4 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs"
              placeholder="Jane Smith"
              required
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
              Username <span className="text-zinc-700">(optional — auto-generated if blank)</span>
            </label>
            <input
              id="reg-username"
              type="text"
              value={form.username}
              onChange={set('username')}
              className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3 px-4 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs tracking-wider"
              placeholder="e.g. jane_smith"
              autoComplete="username"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Email Address</label>
            <input
              id="reg-email"
              type="email"
              value={form.email}
              onChange={set('email')}
              className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3 px-4 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs"
              placeholder="you@example.com"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Password</label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3 px-4 pr-10 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs"
                placeholder="Min 6 characters"
                required
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <PasswordStrengthBar password={form.password} />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Confirm Password</label>
            <div className="relative">
              <input
                id="reg-confirm"
                type={showConfirm ? 'text' : 'password'}
                value={form.confirm}
                onChange={set('confirm')}
                className={`w-full bg-black border rounded-sm py-3 px-4 pr-10 focus:outline-none transition-all font-mono placeholder:text-zinc-700 text-xs ${
                  form.confirm && form.password !== form.confirm
                    ? 'border-red-900 text-red-300'
                    : form.confirm && form.password === form.confirm
                    ? 'border-emerald-800 text-zinc-200'
                    : 'border-zinc-800 text-zinc-200'
                }`}
                placeholder="Re-enter password"
                required
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {form.confirm && form.password !== form.confirm && (
              <p className="text-[9px] text-red-400 mt-1 tracking-wide">Passwords do not match</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            id="register-submit-btn"
            disabled={isLoading || !!successMsg}
            className="w-full flex items-center justify-center gap-2 bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 font-black py-4 rounded-sm transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed uppercase text-[11px] tracking-widest shadow-md shadow-[#e3e3cb]/10 mt-2"
          >
            {isLoading
              ? <><Loader2 className="animate-spin" size={16} /><span>Creating Account...</span></>
              : <><ShieldCheck size={16} strokeWidth={2} /><span>Create Account</span></>
            }
          </button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Already have an account? </span>
          <Link to="/login" className="text-[9px] text-zinc-400 hover:text-[#e3e3cb] uppercase font-black tracking-widest transition-colors">
            LOGIN
          </Link>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-950/80 border border-zinc-900 text-[9px] text-zinc-500 font-black tracking-widest uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Encrypted Registration: AES-256-GCM</span>
      </div>
    </div>
  );
}
