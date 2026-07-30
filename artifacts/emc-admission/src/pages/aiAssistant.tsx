import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Trash2, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { apiUrl } from '@/lib/apiConfig';
import { exportAllStoresForAI } from '@/lib/aiContext';
import { useAuth } from '@/context/AuthContext';

/* ── Types ─────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/* ── Markdown-lite renderer ─────────────────────────────────────────── */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={key++} className="font-semibold text-foreground mt-3 mb-1 text-sm">
          {line.slice(3)}
        </h3>
      );
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={key++} className="font-bold text-foreground mt-3 mb-1">
          {line.slice(2)}
        </h2>
      );
      i++; continue;
    }
    if (line.match(/^[-•*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-•*]\s/)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5 my-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-0.5 my-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">{inlineFormat(item)}</li>
          ))}
        </ol>
      );
      continue;
    }
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1.5" />);
      i++; continue;
    }
    elements.push(
      <p key={key++} className="text-sm leading-relaxed">{inlineFormat(line)}</p>
    );
    i++;
  }
  return <>{elements}</>;
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
          : part
      )}
    </>
  );
}

/* ── Avatar initials ────────────────────────────────────────────────── */
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

/* ── Message bubble ─────────────────────────────────────────────────── */
function MessageBubble({
  message,
  isStreaming,
  userName,
}: {
  message: Message;
  isStreaming?: boolean;
  userName: string;
}) {
  const isUser = message.role === 'user';
  const initials = isUser ? getInitials(userName) : 'AI';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
            ${isUser
              ? 'text-white'
              : 'bg-sidebar text-sidebar-primary-foreground'
            }`}
          style={isUser ? { background: 'linear-gradient(135deg, #26c6da, #0097a7)' } : {}}
        >
          {isUser ? initials : <Bot className="w-4 h-4 text-sidebar-primary" />}
        </div>
        {/* Name label */}
        <span className="text-[10px] text-muted-foreground font-medium leading-none">
          {isUser ? userName.split(' ')[0] : 'AI'}
        </span>
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[76%] rounded-2xl px-4 py-3 shadow-sm
          ${isUser
            ? 'text-white rounded-tr-sm'
            : 'bg-card border border-border rounded-tl-sm text-foreground'
          }`}
        style={isUser ? { background: 'linear-gradient(135deg, #26c6da 0%, #00acc1 100%)' } : {}}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            {renderMarkdown(message.content)}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
        )}
        <p className={`text-[10px] mt-1.5 ${isUser ? 'text-white/60' : 'text-muted-foreground'}`}>
          {message.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

/* ── Welcome state ──────────────────────────────────────────────────── */
function WelcomeScreen({ userName }: { userName: string }) {
  const firstName = userName.split(' ')[0];
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-5 pb-16 px-4">
      {/* Animated icon */}
      <div className="relative">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: 'linear-gradient(135deg, #26c6da 0%, #0097a7 100%)' }}
        >
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        {/* Pulse ring */}
        <div
          className="absolute inset-0 rounded-2xl animate-ping opacity-20"
          style={{ background: 'linear-gradient(135deg, #26c6da 0%, #0097a7 100%)' }}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">
          Halo, {firstName}! 👋
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
          Saya siap membantu Anda menggunakan <span className="font-semibold text-primary">IP Admission Workspace</span> dan menjawab pertanyaan seputar medis & operasional RS.
        </p>
      </div>


      <p className="text-xs text-muted-foreground/60 mt-1">
        Ketik pertanyaan Anda di bawah untuk mulai
      </p>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function AIAssistantPage() {
  const { user } = useAuth();
  const userName = user?.namaLengkap ?? 'Pengguna';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useEffect(() => {
    if (streamingId || messages.length) scrollToBottom();
  }, [messages, streamingId, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
    setStreamingId(assistantId);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const applicationContext = await exportAllStoresForAI();

      const res = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, applicationContext }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sseError: string | null = null;
      let sseDone = false;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: any;
          try { event = JSON.parse(raw); } catch { continue; }
          if (event.error) { sseError = event.error; break outer; }
          if (event.done) { sseDone = true; break outer; }
          if (event.content) {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: m.content + event.content } : m)
            );
          }
        }
      }

      if (sseError) throw new Error(sseError);
      void sseDone;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errMsg: string = err?.message ?? '';
      const displayMsg =
        errMsg && !errMsg.startsWith('HTTP ') && !errMsg.startsWith('Failed to fetch')
          ? errMsg
          : 'Gagal mendapatkan respons dari AI. Silakan coba lagi.';
      toast.error(displayMsg, { duration: 8000 });
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setIsLoading(false);
      setStreamingId(null);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setStreamingId(null);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b bg-card px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, #26c6da 0%, #0097a7 100%)' }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground leading-tight text-sm">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">IP Admission Workspace · Data aplikasi terhubung</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="text-xs gap-1.5 border"
            style={{ borderColor: 'rgba(0,172,193,0.25)', background: 'rgba(0,181,200,0.08)', color: '#00acc1' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Online
          </Badge>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="text-muted-foreground hover:text-destructive gap-1.5 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Hapus
            </Button>
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-6 space-y-6 relative"
      >
        {isEmpty ? (
          <WelcomeScreen userName={userName} />
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={msg.id === streamingId && isLoading}
                userName={userName}
              />
            ))}

            {/* Typing dots */}
            {isLoading && streamingId && messages.find(m => m.id === streamingId)?.content === '' && (
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-sidebar flex items-center justify-center shadow-sm">
                    <Bot className="w-4 h-4 text-sidebar-primary" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">AI</span>
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm self-start">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:0ms]"
                      style={{ background: '#26c6da' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:150ms]"
                      style={{ background: '#00acc1' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:300ms]"
                      style={{ background: '#0097a7' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollBtn && (
        <div className="absolute right-5 bottom-[88px] z-10">
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full shadow-md w-8 h-8 border"
            onClick={() => scrollToBottom()}
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div
            className="flex gap-2 items-end rounded-2xl border px-3 py-2 transition-all focus-within:shadow-sm"
            style={{ background: 'var(--color-background)', borderColor: 'rgba(0,172,193,0.25)' }}
            onFocus={() => {}}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pertanyaan Anda… (Enter kirim · Shift+Enter baris baru)"
              rows={1}
              className="resize-none min-h-[36px] max-h-36 overflow-y-auto leading-relaxed flex-1 border-0 shadow-none bg-transparent focus-visible:ring-0 p-0 text-sm"
              style={{ height: 'auto' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
              }}
              disabled={isLoading}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              style={
                input.trim() && !isLoading
                  ? { background: 'linear-gradient(135deg, #26c6da 0%, #0097a7 100%)', border: 'none' }
                  : {}
              }
            >
              {isLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/60 mt-2">
            AI Assistant dapat membuat kesalahan. Verifikasi informasi penting dengan tenaga kesehatan berwenang.
          </p>
        </div>
      </div>
    </div>
  );
}
