import { useEffect, useRef, useState } from "react";

import { ChatMessage, sendClinicianChat, sendPatientChat } from "../../lib/api/services";

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: "clinician" | "patient";
}

const WELCOME: Record<"clinician" | "patient", string> = {
  clinician:
    "Hello, I'm DeepSynaps ClinicalAI. Ask me about protocols, evidence, contraindications, or your patients.",
  patient:
    "Hello! I'm your health assistant. Ask me about your treatment, what to expect, or any questions about your sessions.",
};

function renderContent(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => {
    const bold = line.replace(/\*\*(.*?)\*\*/g, (_, m: string) => `<strong>${m}</strong>`);
    if (line.startsWith("- "))
      return (
        <li
          key={i}
          className="ml-4 list-disc text-sm"
          style={{ color: "var(--text-muted)" }}
          dangerouslySetInnerHTML={{ __html: bold.slice(2) }}
        />
      );
    if (line === "") return <br key={i} />;
    return (
      <p
        key={i}
        className="text-sm leading-6"
        style={{ color: "var(--text)" }}
        dangerouslySetInnerHTML={{ __html: bold }}
      />
    );
  });
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-2 w-2 rounded-full animate-bounce"
          style={{
            background: "var(--text-subtle)",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

export function ChatDrawer({ open, onClose, mode }: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Focus textarea when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const allMsgs = [...messages, userMsg];
      const fn = mode === "clinician" ? sendClinicianChat : sendPatientChat;
      const res = await fn(allMsgs);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setError("Could not reach AI assistant. Check your connection or API key.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
    setInput("");
  }

  const modeBadgeLabel = mode === "clinician" ? "Clinician" : "Patient";

  return (
    <>
      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Chat"
        className={`fixed inset-y-0 right-0 z-40 flex flex-col w-full max-w-[400px] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          background: "var(--bg-elevated)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-base" style={{ color: "var(--text)" }}>
              DeepSynaps AI
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-soft-border)",
                color: "var(--accent)",
              }}
            >
              {modeBadgeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Clear conversation */}
            <button
              onClick={handleClear}
              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg)] text-sm"
              style={{ color: "var(--text-subtle)" }}
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg)]"
              style={{ color: "var(--text-subtle)" }}
              aria-label="Close chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Welcome message */}
          {messages.length === 0 && !loading && (
            <div
              className="rounded-xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              {WELCOME[mode]}
            </div>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div key={idx} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-xl px-4 py-3 max-w-[85%] ${isUser ? "" : ""}`}
                  style={
                    isUser
                      ? {
                          background: "var(--accent)",
                          color: "white",
                        }
                      : {
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                        }
                  }
                >
                  {isUser ? (
                    <p className="text-sm leading-6" style={{ color: "white" }}>
                      {msg.content}
                    </p>
                  ) : (
                    <div>{renderContent(msg.content)}</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-xl max-w-[85%]"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <LoadingDots />
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div
            className="flex items-end gap-2 rounded-xl px-3 py-2"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--text-subtle)] leading-6 max-h-32 overflow-y-auto"
              style={{ color: "var(--text)" }}
              aria-label="Message input"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || loading}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: "var(--accent)", color: "white" }}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
          <p className="mt-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
            Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}
