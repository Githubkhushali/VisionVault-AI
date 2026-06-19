import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail, KeyRound, Eye, EyeOff, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import axios from 'axios';

// ─── Forgot Password Step (enter email) ──────────────────────
function ForgotStep() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toast = (type, message) => {
    window.dispatchEvent(new CustomEvent('toast', { detail: { type, message } }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', { email: email.trim() });
      setSubmitted(true);
      toast('success', 'If that email exists, a reset link has been sent.');
    } catch (err) {
      const msg = err.response?.data?.message || 'Request failed. Please try again.';
      setErrorMsg(msg);
      toast('error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center space-y-5">
        <div className="w-14 h-14 mx-auto border border-emerald-900 rounded-sm flex items-center justify-center bg-emerald-950/40">
          <CheckCircle size={26} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-black text-white tracking-widest uppercase mb-2">Check Your Email</h2>
          <p className="text-[10px] text-zinc-400 leading-relaxed max-w-xs mx-auto">
            If an account exists for <span className="text-zinc-300 font-bold">{email}</span>, a password
            reset link has been sent. The link expires in <span className="text-zinc-300">1 hour</span>.
          </p>
          <p className="text-[9px] text-zinc-600 mt-4 leading-relaxed max-w-xs mx-auto">
            Don't see it? Check your spam folder. If SES email is not configured, the reset link is logged to the server console.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-center">
          <button
            onClick={() => { setSubmitted(false); setEmail(''); }}
            className="flex items-center gap-1.5 text-[9px] text-zinc-500 hover:text-zinc-300 uppercase tracking-widest font-black transition-colors"
          >
            <RotateCcw size={10} />
            Try a different email
          </button>
          <Link to="/login" className="text-[9px] text-zinc-500 hover:text-zinc-300 uppercase tracking-widest font-black transition-colors">
            ← Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto border border-zinc-800 rounded-sm flex items-center justify-center bg-black/40 text-zinc-300 mb-4">
          <Mail size={24} strokeWidth={1.5} />
        </div>
        <h1 className="text-sm font-black text-white tracking-widest uppercase">Recover Access</h1>
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1.5 leading-relaxed">
          Enter your account email and we'll send a reset link
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-sm p-3">
          <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-[10px] text-red-300 leading-relaxed">{errorMsg}</span>
        </div>
      )}

      <div>
        <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
          Account Email
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3.5 px-4 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs"
          placeholder="you@example.com"
          required
        />
      </div>

      <button
        type="submit"
        id="forgot-password-submit-btn"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 font-black py-4 rounded-sm transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed uppercase text-[11px] tracking-widest"
      >
        {isLoading
          ? <><Loader2 className="animate-spin" size={16} /><span>Sending Reset Link...</span></>
          : <><Mail size={16} strokeWidth={2} /><span>Send Reset Link</span></>
        }
      </button>
    </form>
  );
}

// ─── Reset Password Step (enter new password) ────────────────
function ResetStep({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  const toast = (type, message) => {
    window.dispatchEvent(new CustomEvent('toast', { detail: { type, message } }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (password !== confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.post('/api/auth/reset-password', { token, password });
      if (res.data.success) {
        setDone(true);
        toast('success', 'Password reset! Please log in with your new password.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Reset failed. The link may have expired.';
      setErrorMsg(msg);
      toast('error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-5">
        <div className="w-14 h-14 mx-auto border border-emerald-900 rounded-sm flex items-center justify-center bg-emerald-950/40">
          <CheckCircle size={26} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-black text-white tracking-widest uppercase mb-2">Password Reset!</h2>
          <p className="text-[10px] text-zinc-400 leading-relaxed">
            Your password has been updated. You can now log in with your new password.
          </p>
        </div>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 font-black py-3 px-6 rounded-sm uppercase text-[11px] tracking-widest transition-all"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto border border-zinc-800 rounded-sm flex items-center justify-center bg-black/40 text-zinc-300 mb-4">
          <KeyRound size={24} strokeWidth={1.5} />
        </div>
        <h1 className="text-sm font-black text-white tracking-widest uppercase">Set New Password</h1>
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1.5">
          Enter and confirm your new password
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-sm p-3">
          <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-[10px] text-red-300 leading-relaxed">{errorMsg}</span>
        </div>
      )}

      <div>
        <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">New Password</label>
        <div className="relative">
          <input
            id="reset-password-input"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3.5 px-4 pr-10 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs"
            placeholder="Min 6 characters"
            required
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">Confirm Password</label>
        <div className="relative">
          <input
            id="reset-confirm-input"
            type={showConfirm ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`w-full bg-black border rounded-sm py-3.5 px-4 pr-10 focus:outline-none transition-all font-mono placeholder:text-zinc-700 text-xs ${
              confirm && password !== confirm ? 'border-red-900 text-red-300' : 'border-zinc-800 text-zinc-200'
            }`}
            placeholder="Re-enter password"
            required
          />
          <button type="button" onClick={() => setShowConfirm(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
            {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        id="reset-password-submit-btn"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 font-black py-4 rounded-sm transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed uppercase text-[11px] tracking-widest"
      >
        {isLoading
          ? <><Loader2 className="animate-spin" size={16} /><span>Resetting...</span></>
          : <><KeyRound size={16} strokeWidth={2} /><span>Reset Password</span></>
        }
      </button>
    </form>
  );
}

// ─── Page Wrapper ─────────────────────────────────────────────
export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

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
          background: linear-gradient(90deg, transparent, rgba(227,227,203,0.25), transparent);
          animation: scan 6s ease-in-out infinite; pointer-events: none; z-index: 10;
        }
      `}</style>

      {/* Back link (only on forgot step) */}
      {!token && (
        <div className="w-full max-w-md mb-4">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[9px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-black transition-colors">
            <ArrowLeft size={11} />
            BACK_TO_LOGIN
          </Link>
        </div>
      )}

      {/* Card */}
      <div className="border border-zinc-800 bg-[#0c0c0c] rounded-sm p-8 w-full max-w-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-zinc-700" />
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-zinc-700" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-zinc-700" />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-zinc-700" />
        <div className="tech-scanner-line" />

        {token ? <ResetStep token={token} /> : <ForgotStep />}
      </div>

      {/* Encrypted tag */}
      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-950/80 border border-zinc-900 text-[9px] text-zinc-500 font-black tracking-widest uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Secure Recovery: AES-256-GCM</span>
      </div>
    </div>
  );
}
