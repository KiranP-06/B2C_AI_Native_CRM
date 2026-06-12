import { useState, useEffect, useRef } from 'react';
import { Activity, Send, CheckCircle2, MailOpen, MousePointerClick, Zap, MessageSquare, DollarSign, BrainCircuit, Play } from 'lucide-react';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [finops, setFinops] = useState({ totalTokens: 0, totalSpend: 0, cacheHitRate: 0 });
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [campaignConfig, setCampaignConfig] = useState({ channel: 'WHATSAPP', message: '' });

  // Web Socket Connection
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5001');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'LOG_UPDATE') {
        setLogs(prev => {
          const exists = prev.find(l => l.id === data.payload.id);
          if (exists) {
            return prev.map(l => l.id === data.payload.id ? data.payload : l);
          }
          return [data.payload, ...prev];
        });
      }
      if (data.type === 'FINOPS_UPDATE') {
        setFinops(data.payload);
      }
    };
    
    // Initial fetch of finops
    fetch('/api/finops').then(res => res.json()).then(setFinops).catch(console.error);
    
    return () => ws.close();
  }, []);

  const triggerDispatch = async () => {
    await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: `camp_${Date.now()}`,
        target_channel: campaignConfig.channel,
        message_text: campaignConfig.message || "Hello!"
      })
    });
  };

  const loadInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch('/api/insights', { method: 'POST' });
      const data = await res.json();
      setInsights(data.data.insights);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInsights(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PENDING': return <Activity className="text-yellow-400 w-4 h-4" />;
      case 'SENT': return <Send className="text-blue-400 w-4 h-4" />;
      case 'DELIVERED': return <CheckCircle2 className="text-brand-400 w-4 h-4" />;
      case 'OPENED': return <MailOpen className="text-purple-400 w-4 h-4" />;
      case 'CLICKED': return <MousePointerClick className="text-emerald-400 w-4 h-4" />;
      case 'FAILED': return <div className="text-red-400 w-4 h-4 rounded-full border-2 border-red-400"></div>;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-500/20 rounded-xl">
            <Zap className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">AI-Native CRM</h1>
            <p className="text-slate-400 text-sm">Enterprise Automation Engine</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Observability & Controls */}
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-2 text-white">
              <BrainCircuit className="w-5 h-5 text-emerald-400" />
              <h2 className="font-semibold">AI Observability Center</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-900/50 p-4 rounded-lg border border-slate-700/50">
                <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">Total Spend</p>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-xl font-bold text-white">${finops.totalSpend.toFixed(6)}</span>
                </div>
              </div>
              <div className="bg-dark-900/50 p-4 rounded-lg border border-slate-700/50">
                <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">Cache Hit Rate</p>
                <span className="text-xl font-bold text-white">{finops.cacheHitRate.toFixed(1)}%</span>
              </div>
              <div className="bg-dark-900/50 p-4 rounded-lg border border-slate-700/50 col-span-2">
                <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">Tokens Used</p>
                <span className="text-xl font-bold text-white">{finops.totalTokens.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 space-y-4">
            <h2 className="font-semibold text-white">Sandbox Dispatch</h2>
            <div className="space-y-3">
              <select 
                className="w-full bg-dark-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                value={campaignConfig.channel}
                onChange={(e) => setCampaignConfig({...campaignConfig, channel: e.target.value})}
              >
                <option value="WHATSAPP">Target: WhatsApp</option>
                <option value="EMAIL">Target: Email</option>
                <option value="SMS">Target: SMS</option>
              </select>
              <textarea 
                className="w-full bg-dark-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-brand-500 min-h-[80px]"
                placeholder="Message Draft..."
                value={campaignConfig.message}
                onChange={(e) => setCampaignConfig({...campaignConfig, message: e.target.value})}
              />
              <button 
                onClick={triggerDispatch}
                className="w-full bg-brand-500 hover:bg-brand-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Fire Test Dispatch
              </button>
            </div>
          </div>
        </div>

        {/* Middle Column: Event Stream */}
        <div className="glass-panel p-0 flex flex-col h-[600px] lg:col-span-2">
          <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-dark-800/80 rounded-t-xl">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-400" />
              Live Delivery Stream
            </h2>
            <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-1 rounded-full animate-pulse">WebSocket Active</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {logs.length === 0 && (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Waiting for dispatch events...
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="bg-dark-900/40 p-3 rounded-lg border border-slate-700/30 flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(log.current_status)}
                  <div>
                    <p className="text-sm text-white font-medium">{log.customer_name} <span className="text-slate-400 font-normal ml-1">({log.channel})</span></p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{log.idempotency_key.substring(0, 16)}...</p>
                  </div>
                </div>
                <div className="text-xs px-2 py-1 rounded-md bg-dark-900 text-slate-300 font-medium tracking-wide">
                  {log.current_status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Flashcards Section */}
      <div className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-400" />
            Proactive AI Insights
          </h2>
          <button 
            onClick={loadInsights}
            disabled={loadingInsights}
            className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loadingInsights ? 'Analyzing Trends...' : 'Generate Flashcards'}
          </button>
        </div>

        {insights && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((card, i) => (
              <div 
                key={i} 
                onClick={() => setCampaignConfig({ channel: card.audience_segment.includes('WHATSAPP') ? 'WHATSAPP' : 'EMAIL', message: card.message_draft })}
                className="glass-panel p-5 cursor-pointer hover:border-brand-500/50 transition-colors group"
              >
                <div className="mb-4">
                  <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">{card.audience_segment}</span>
                  <h3 className="text-lg font-bold text-white mt-1 group-hover:text-brand-300 transition-colors">{card.suggested_strategy}</h3>
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">{card.trend}</p>
                </div>
                <div className="bg-dark-900/60 p-3 rounded-lg border border-slate-700/50">
                  <p className="text-sm text-slate-300 italic">"{card.message_draft}"</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
