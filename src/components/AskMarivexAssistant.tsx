import React, { useState, useRef, useEffect } from 'react';
import { Coordinates, MarivexChatMessage, OceanObservation, OceanRegion } from '../types/ocean';
import { askMarivex, SUGGESTED_ASSISTANT_QUESTIONS } from '../utils/assistantEngine';
import { 
  Bot, 
  Send, 
  X, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Compass, 
  Waves, 
  Activity, 
  ShieldCheck, 
  Radio, 
  Info,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface AskMarivexAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  coords: Coordinates | null;
  region: OceanRegion | null;
  oceanData: OceanObservation | null;
  depth: number;
  hour: number;
}

export const AskMarivexAssistant: React.FC<AskMarivexAssistantProps> = ({
  isOpen,
  onClose,
  coords,
  region,
  oceanData,
  depth,
  hour
}) => {
  const [messages, setMessages] = useState<MarivexChatMessage[]>([
    {
      id: 'init-msg',
      role: 'assistant',
      content: `Hello! I am **Ask MARIVEX**, your oceanographic telemetry and scientific analysis assistant.\n\nI am connected to your active 3D globe coordinates and live NOAA WaveWatch III (WW3 via ERDDAP) wave models, GEBCO 2024 bathymetry, and Open-Meteo marine grids. Click any suggested query below or ask any question about wave dynamics, subsea geology, or regional marine conditions.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sources: ['NOAA WaveWatch III', 'GEBCO 2024 Grid', 'Open-Meteo Marine']
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q || isTyping) return;

    const userMsg: MarivexChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      telemetryContext: {
        location: region?.name || oceanData?.oceanBasin || 'Open Ocean',
        coordinates: coords ? `${coords.latitude.toFixed(2)}°N, ${coords.longitude.toFixed(2)}°E` : undefined,
        waveHeight: oceanData?.waveHeight !== null ? `${oceanData?.waveHeight}m` : undefined,
        temperature: oceanData?.temperature !== null ? `${oceanData?.temperature}°C` : undefined,
        depth: `${oceanData?.bathymetryDepth ?? depth}m`
      }
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await askMarivex(q, {
        coords,
        region,
        oceanData,
        depth,
        hour
      });

      const assistantMsg: MarivexChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: response.sources
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Failed to get answer:', err);
      const errorMsg: MarivexChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error retrieving ocean telemetry answer: ${err instanceof Error ? err.message : 'Telemetry pipeline error'}. Please retry.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-40 transition-all duration-300 pointer-events-auto ${
      isMinimized ? 'w-80 h-14' : 'w-[94vw] sm:w-[460px] h-[580px] max-h-[85vh]'
    }`}>
      <div className="w-full h-full flex flex-col rounded-3xl border border-cyan-500/35 bg-[#031122]/95 backdrop-blur-2xl text-slate-100 shadow-2xl shadow-cyan-950/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-[#051c38]/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Bot className="w-4 h-4 text-cyan-100" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold font-mono text-white">Ask MARIVEX</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-semibold">
                  AI ASSISTANT
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                {region?.name || oceanData?.oceanBasin || 'Global Oceanic Grid'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title={isMinimized ? 'Expand Panel' : 'Minimize Panel'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Live Context Ribbon */}
            <div className="px-3.5 py-1.5 bg-[#041527] border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-cyan-300/80">
              <div className="flex items-center gap-2 truncate">
                <span className="text-slate-400">PIN:</span>
                <span>{coords ? `${coords.latitude.toFixed(1)}°N, ${coords.longitude.toFixed(1)}°E` : 'Global'}</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Hs:</span>
                <span className="text-cyan-200">{oceanData?.waveHeight ? `${oceanData.waveHeight.toFixed(1)}m` : '--'}</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">DEPTH:</span>
                <span>{oceanData?.bathymetryDepth ? `${oceanData.bathymetryDepth}m` : '--'}</span>
              </div>
              <span className="text-emerald-400 flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                GROUNDED
              </span>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`p-3 rounded-2xl max-w-[92%] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-cyan-500 text-black font-medium rounded-tr-sm shadow-md shadow-cyan-900/30'
                        : 'bg-[#06213f] text-slate-100 border border-cyan-500/20 rounded-tl-sm'
                    }`}
                  >
                    {m.content}
                  </div>

                  {/* Sources tag for assistant answers */}
                  {m.sources && m.sources.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 text-[9px] font-mono text-slate-400">
                      <ShieldCheck className="w-3 h-3 text-cyan-400" />
                      <span>Sources: {m.sources.join(' · ')}</span>
                    </div>
                  )}

                  <span className="text-[9px] font-mono text-slate-500 mt-0.5 px-1">
                    {m.timestamp}
                  </span>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#06213f] border border-cyan-500/20 w-fit text-cyan-300 font-mono text-xs">
                  <Bot className="w-4 h-4 animate-spin" />
                  <span>Synthesizing physical oceanographic model...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Questions Carousel */}
            <div className="p-2.5 bg-[#031528] border-t border-white/5">
              <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                SUGGESTED QUESTIONS:
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {SUGGESTED_ASSISTANT_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="px-2.5 py-1 rounded-lg border border-cyan-500/20 bg-[#051f3b] hover:bg-cyan-500/20 hover:border-cyan-400 text-[11px] text-cyan-200 whitespace-nowrap shrink-0 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-cyan-500/20 bg-[#041a33]/90 flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about wave height, GEBCO depth, storms..."
                className="flex-1 px-3 py-2 rounded-xl bg-[#031122] border border-cyan-500/30 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className="p-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-black font-bold transition-colors shadow-md shadow-cyan-500/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
