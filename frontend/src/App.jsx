import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import {
  Activity, Send, CheckCircle2, MailOpen, MousePointerClick,
  Zap, DollarSign, BrainCircuit, Play, RefreshCw, Radio,
  ChevronRight, Sparkles, Database, AlertTriangle, Wifi, WifiOff,
  Hash, TrendingUp, Target, Users, BarChart3
} from 'lucide-react';

// ─── Initialize Supabase Client ───
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qmvfmwycfazrnnhlkcqk.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_V56orvYiqzHQEVFxHqQUlA_U1qUFk-v';
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── KPI Aggregation ───
function computeKPIs(logs) {
  const counts = { SENT: 0, DELIVERED: 0, OPENED: 0, CLICKED: 0, FAILED: 0 };
  const total = logs.length;
  logs.forEach(l => { if (counts[l.current_status] !== undefined) counts[l.current_status]++; });
  const kpis = {};
  for (const status in counts) {
    kpis[status] = total > 0 ? Math.round((counts[status] / total) * 100) : 0;
  }
  return { percentages: kpis, raw: counts, total };
}

const STATUS_CONFIG = {
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
  const [selectedStatus, setSelectedStatus] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const [customers, setCustomers] = useState({});

  // ─── Fetch Initial Data ───
  useEffect(() => {
    // Fetch customers
    fetch('/api/customers')
      .then(r => r.json())
      .then(data => {
        const cMap = {};
        data.forEach(c => cMap[c.id] = c);
        setCustomers(cMap);
      })
      .catch(console.error);
      
    // Fetch initial FinOps stats
    fetch('/api/finops').then(r => r.json()).then(setFinops).catch(() => {});

    // Fetch initial logs
    fetch('/api/logs')
      .then(r => r.json())
      .then(data => {
        setLogs(data);
        setEventFeed(data.slice(0, 50).map(l => ({ ts: new Date(l.last_updated_at).toLocaleTimeString(), ...l })));
      })
      .catch(console.error);
  }, []);

  // ─── True Supabase Realtime ───
  useEffect(() => {
    // We only connect Realtime once we have the customers map populated
    if (Object.keys(customers).length === 0) return;
    
    setWsConnected(true); // Optimistic UI for connection state

    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'MessageLog' },
        (payload) => {
          const data = payload.new;
          if (!data) return;

          const customer = customers[data.customer_id] || {};
          const enrichedLog = {
            ...data,
            customer_name: customer.name || 'Unknown',
            predicted_preferred_channel: customer.predicted_preferred_channel || 'UNKNOWN',
            is_vip_rigid_routing: customer.is_vip_rigid_routing || false
          };

          setLogs(prev => {
            const idx = prev.findIndex(l => l.id === enrichedLog.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = enrichedLog;
              return next;
            }
            return [enrichedLog, ...prev];
          });
          
          setEventFeed(prev => [
            { ts: new Date().toLocaleTimeString(), ...enrichedLog },
            ...prev.slice(0, 50)
          ]);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setWsConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setWsConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customers]);

  // ─── Dispatch ───
  const triggerDispatch = async () => {
    setDispatching(true);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: crypto.randomUUID(),
          target_channel: channel,
          message_text: message || 'Hello from AI-Native CRM!'
        })
      });
      const data = await res.json();
      if (data.results) {
        // Optimistically update the UI to provide immediate feedback
        setLogs(prev => {
          const next = [...prev];
          data.results.forEach(newLog => {
            const idx = next.findIndex(l => l.id === newLog.id);
            if (idx >= 0) next[idx] = newLog;
            else next.unshift(newLog);
          });
          return next;
        });
        setEventFeed(prev => {
          const newEvents = data.results.map(l => ({ ts: new Date().toLocaleTimeString(), ...l }));
          return [...newEvents, ...prev].slice(0, 50);
        });
      }
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

  const kpiData = computeKPIs(logs);

  const optimizedCount = logs.filter(l => l.channel !== l.predicted_preferred_channel && !l.is_vip_rigid_routing).length;
  const bypassCount = logs.filter(l => l.is_vip_rigid_routing).length;
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {Object.entries(kpiData.percentages).map(([status, percentage]) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const isSelected = selectedStatus === status;
          return (
            <div 
              key={status} 
              onClick={() => setSelectedStatus(isSelected ? null : status)}
              className={`stat-chip flex flex-col items-start gap-2 animate-fade-in cursor-pointer transition-all ${isSelected ? 'ring-2 ring-accent-light bg-surface-900' : 'hover:bg-surface-900/60'}`}
            >
              <div className="flex items-center justify-between w-full">
                <div className={`p-1.5 rounded-md ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{status}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-3xl font-bold text-white">{percentage}%</p>
                <p className="text-xs text-slate-400">({kpiData.raw[status]})</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Contextual Details ═══ */}
      {selectedStatus && (
        <div className="glass-card p-4 mb-6 animate-slide-down border-l-4" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              {STATUS_CONFIG[selectedStatus].icon && React.createElement(STATUS_CONFIG[selectedStatus].icon, { className: `w-4 h-4 ${STATUS_CONFIG[selectedStatus].color}` })}
              Customers {selectedStatus}
            </h3>
            <button onClick={() => setSelectedStatus(null)} className="text-xs text-slate-400 hover:text-white">Close Context</button>
          </div>
          <div className="max-h-48 overflow-y-auto pr-2 flex flex-wrap gap-2">
            {logs.filter(l => l.current_status === selectedStatus).length === 0 ? (
              <p className="text-sm text-slate-500 italic w-full text-center py-4">No customers currently in this status.</p>
            ) : (
              logs.filter(l => l.current_status === selectedStatus).map(l => (
                <div key={l.id} className="bg-surface-900/80 px-3 py-1.5 rounded flex items-center gap-2 text-sm text-slate-200 border border-white/[0.03]">
                  <span className="font-medium">{l.customer_name}</span>
                  <span className="text-xs text-slate-500">via {l.channel}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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

        {/* ─── Right: Live Delivery Metrics ─── */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 border-t-2 border-t-accent-light">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-accent-light" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Total Dispatched</h3>
              </div>
              <p className="text-4xl font-black text-white">{kpiData.total}</p>
              <p className="text-xs text-slate-500 mt-2">Active campaign messages</p>
            </div>
            
            <div className="glass-card p-6 border-t-2 border-t-emerald-500">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Optimized Routes</h3>
              </div>
              <p className="text-4xl font-black text-white">{optimizedCount}</p>
              <p className="text-xs text-emerald-500/70 mt-2 font-medium">Smart channel fallbacks applied</p>
            </div>

            <div className="glass-card p-6 border-t-2 border-t-purple-500">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Guardrail Bypasses</h3>
              </div>
              <p className="text-4xl font-black text-white">{bypassCount}</p>
              <p className="text-xs text-purple-500/70 mt-2 font-medium">Strict VIP routing enforced</p>
            </div>
          </div>

          <div className="glass-card p-6 flex flex-col" style={{ minHeight: '344px' }}>
            <div className="flex items-center justify-between mb-4 border-b border-white/[0.04] pb-4">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-accent-light" />
                Recent Delivery Activity
              </h2>
              {wsConnected && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {eventFeed.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 pb-8">
                  <Activity className="w-8 h-8 mb-3 opacity-30" />
                  <p className="font-medium text-sm">No recent activity</p>
                </div>
              ) : (
                eventFeed.slice(0, 8).map((log, idx) => {
                  const cfg = STATUS_CONFIG[log.current_status] || { bg: 'bg-slate-800', color: 'text-slate-400', badge: 'bg-slate-800 text-slate-400', icon: Activity };
                  const Icon = cfg.icon;
                  return (
                    <div key={`${log.id}-${log.current_status}-${idx}`} className="bg-surface-900/30 px-4 py-2.5 rounded-lg border border-white/[0.02] flex items-center justify-between animate-slide-up hover:bg-surface-900/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-md ${cfg.bg} shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium truncate flex items-center gap-2">
                            {log.customer_name} 
                            <span className="text-slate-500 font-normal text-xs">via {log.channel}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 font-mono">{log.ts}</span>
                        <span className={`badge ${cfg.badge} shrink-0 text-[10px] py-0.5 px-1.5`}>
                          {log.current_status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
