import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Send, CheckCircle2, MailOpen, MousePointerClick,
  Zap, DollarSign, BrainCircuit, Play, RefreshCw, Radio,
  ChevronRight, Sparkles, Database, AlertTriangle, Wifi, WifiOff,
  Hash, TrendingUp, Target, Users, BarChart3
} from 'lucide-react';

// ─── KPI Aggregation ───
function computeKPIs(logs) {
  const counts = { PENDING: 0, SENT: 0, DELIVERED: 0, OPENED: 0, CLICKED: 0, FAILED: 0 };
  logs.forEach(l => { if (counts[l.current_status] !== undefined) counts[l.current_status]++; });
  return counts;
}

const STATUS_CONFIG = {
  PENDING:   { icon: Activity,          color: 'text-yellow-400',  bg: 'bg-yellow-500/10', badge: 'badge-pending' },
  SENT:      { icon: Send,              color: 'text-blue-400',    bg: 'bg-blue-500/10',   badge: 'badge-sent' },
  DELIVERED: { icon: CheckCircle2,      color: 'text-emerald-400', bg: 'bg-emerald-500/10', badge: 'badge-delivered' },
  OPENED:    { icon: MailOpen,          color: 'text-purple-400',  bg: 'bg-purple-500/10', badge: 'badge-opened' },
  CLICKED:   { icon: MousePointerClick, color: 'text-cyan-300',    bg: 'bg-cyan-500/10',   badge: 'badge-clicked' },
  FAILED:    { icon: AlertTriangle,     color: 'text-red-400',     bg: 'bg-red-500/10',    badge: 'badge-failed' },
};

// ─── Main App ───
export default function App() {
  const [logs, setLogs] = useState([]);
  const [finops, setFinops] = useState({ totalTokens: 0, totalSpend: 0, cacheHitRate: 0 });
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [channel, setChannel] = useState('WHATSAPP');
  const [message, setMessage] = useState('');
  const [eventFeed, setEventFeed] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  // ─── WebSocket with Auto-Reconnect ───
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(`ws://${window.location.hostname}:5001`);
      ws.onopen = () => { setWsConnected(true); };
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer.current = setTimeout(connectWs, 3000);
      };
      ws.onerror = () => { ws.close(); };
      ws.onmessage = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.type === 'LOG_UPDATE') {
          setLogs(prev => {
            const idx = prev.findIndex(l => l.id === data.payload.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = data.payload;
              return next;
            }
            return [data.payload, ...prev];
          });
          setEventFeed(prev => [
            { ts: new Date().toLocaleTimeString(), ...data.payload },
            ...prev.slice(0, 50)
          ]);
        }
        if (data.type === 'FINOPS_UPDATE') setFinops(data.payload);
      };
      wsRef.current = ws;
    } catch { setWsConnected(false); }
  }, []);

  useEffect(() => {
    connectWs();
    fetch('/api/finops').then(r => r.json()).then(setFinops).catch(() => {});
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // ─── Dispatch ───
  const triggerDispatch = async () => {
    setDispatching(true);
    try {
      await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: `camp_${Date.now()}`,
          target_channel: channel,
          message_text: message || 'Hello from AI-Native CRM!'
        })
      });
    } catch (e) { console.error('Dispatch error:', e); }
    finally { setDispatching(false); }
  };

  // ─── AI Insights ───
  const loadInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch('/api/insights', { method: 'POST' });
      const data = await res.json();
      setInsights(data.data?.insights || []);
      // refresh finops
      fetch('/api/finops').then(r => r.json()).then(setFinops).catch(() => {});
    } catch (e) { console.error('Insights error:', e); }
    finally { setLoadingInsights(false); }
  };

  const kpis = computeKPIs(logs);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">

      {/* ═══ Header ═══ */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-accent/10 rounded-2xl border border-accent/20">
            <Zap className="w-7 h-7 text-accent-light" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">AI-Native CRM</h1>
            <p className="text-slate-500 text-sm font-medium">Enterprise Automation Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`badge ${wsConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {wsConnected ? 'Live' : 'Disconnected'}
          </div>
          <div className="badge bg-accent/10 text-accent-light border border-accent/20">
            <Database className="w-3.5 h-3.5" />
            Supabase
          </div>
        </div>
      </header>

      {/* ═══ KPI Strip ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Object.entries(kpis).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          return (
            <div key={status} className="stat-chip flex items-center gap-3 animate-fade-in">
              <div className={`p-2 rounded-lg ${cfg.bg}`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{count}</p>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{status}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Main Grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">

        {/* ─── Left: Controls + Observability ─── */}
        <div className="lg:col-span-4 space-y-6">

          {/* AI Observability */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <BrainCircuit className="w-5 h-5 text-accent-light" />
              <h2 className="font-bold text-white">AI Observability</h2>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="stat-chip">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Spend</span>
                  <DollarSign className="w-4 h-4 text-emerald-500/60" />
                </div>
                <span className="text-2xl font-bold text-white font-mono">${finops.totalSpend.toFixed(8)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="stat-chip">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">Tokens</span>
                  <span className="text-xl font-bold text-white">{finops.totalTokens.toLocaleString()}</span>
                </div>
                <div className="stat-chip">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">Cache Hit</span>
                  <span className="text-xl font-bold text-white">{finops.cacheHitRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dispatch Panel */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <Target className="w-5 h-5 text-accent-light" />
              <h2 className="font-bold text-white">Campaign Dispatch</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-2">Target Channel</label>
                <select
                  className="input-field"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="RCS">RCS</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-2">Message Draft</label>
                <textarea
                  className="input-field min-h-[80px] resize-none"
                  placeholder="Write your campaign message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <button
                onClick={triggerDispatch}
                disabled={dispatching}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {dispatching
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Dispatching...</>
                  : <><Play className="w-4 h-4" /> Fire Dispatch</>}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Right: Live Event Stream ─── */}
        <div className="lg:col-span-8 glass-card flex flex-col" style={{ minHeight: '560px' }}>
          <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
            <h2 className="font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-accent-light" />
              Live Delivery Stream
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{logs.length} events</span>
              {wsConnected && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600">
                <Radio className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No events yet</p>
                <p className="text-sm mt-1">Fire a dispatch to see real-time delivery tracking</p>
              </div>
            ) : (
              logs.map((log) => {
                const cfg = STATUS_CONFIG[log.current_status] || STATUS_CONFIG.PENDING;
                const Icon = cfg.icon;
                return (
                  <div key={log.id + log.current_status} className="bg-surface-900/50 px-4 py-3 rounded-xl border border-white/[0.03] flex items-center justify-between animate-slide-up">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-1.5 rounded-lg ${cfg.bg} shrink-0`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white font-semibold truncate">
                          {log.customer_name || 'Customer'}
                          <span className="text-slate-500 font-normal ml-2 text-xs">{log.channel}</span>
                        </p>
                        <p className="text-xs text-slate-600 font-mono truncate mt-0.5">
                          {log.idempotency_key?.substring(0, 20)}…
                        </p>
                      </div>
                    </div>
                    <span className={`badge ${cfg.badge} shrink-0 ml-3`}>
                      {log.current_status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══ AI Flashcards ═══ */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Proactive AI Insights</h2>
          </div>
          <button
            onClick={loadInsights}
            disabled={loadingInsights}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {loadingInsights
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing...</>
              : <><BrainCircuit className="w-4 h-4" /> Generate Flashcards</>}
          </button>
        </div>

        {!insights && (
          <div className="glass-card p-12 flex flex-col items-center justify-center text-slate-600">
            <Sparkles className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium">No insights generated yet</p>
            <p className="text-sm mt-1">Click "Generate Flashcards" to get AI-powered campaign suggestions</p>
          </div>
        )}

        {insights && insights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((card, i) => (
              <div
                key={i}
                onClick={() => {
                  const ch = card.audience_segment?.includes('WHATSAPP') ? 'WHATSAPP'
                    : card.audience_segment?.includes('SMS') ? 'SMS' : 'EMAIL';
                  setChannel(ch);
                  setMessage(card.message_draft || '');
                }}
                className="glass-card-hover p-6 cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs">
                    <Users className="w-3 h-3" />
                    {card.audience_segment}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-accent-light transition-colors" />
                </div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-accent-light transition-colors leading-snug">
                  {card.suggested_strategy}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-4">{card.trend}</p>
                <div className="bg-surface-900/60 p-3 rounded-xl border border-white/[0.04]">
                  <p className="text-sm text-slate-300 italic leading-relaxed">"{card.message_draft}"</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="text-center text-xs text-slate-700 py-4 border-t border-white/[0.03]">
        AI-Native CRM v1.0 — Built with React, Tailwind CSS, Express, Prisma & Supabase
      </footer>
    </div>
  );
}
