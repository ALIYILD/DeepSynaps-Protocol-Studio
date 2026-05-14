import { useCallback, useRef, useEffect, useState } from "react";

import { useAiStore } from "../stores/ai";
import { useCopilotChat } from "./useCopilotChat";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { CitationsFooter } from "./CitationsFooter";

export function CopilotPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");

  const { messages, isLoading, sendMessage, clearChat, copyToReport } =
    useCopilotChat();
  const citations = useAiStore((s) => s.citations);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSuggestionSelect = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      setInputValue("");
      sendMessage(content);
    },
    [sendMessage]
  );

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClear = useCallback(() => {
    clearChat();
  }, [clearChat]);

  // Collapsed tab view
  if (!isOpen) {
    return (
      <div className="flex h-full flex-col items-center border-l border-gray-200 bg-slate-50 py-4 shadow-sm">
        <button
          type="button"
          onClick={togglePanel}
          className="group flex flex-col items-center gap-2 rounded-lg p-2 transition-colors hover:bg-slate-200"
          title="Open Clinical Copilot"
          aria-label="Open Clinical Copilot"
          data-testid="copilot-panel"
        >
          {/* Sparkle / AI Icon */}
          <svg
            className="h-6 w-6 text-blue-600 transition-transform group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
          <span
            className="text-[10px] font-semibold tracking-wide text-slate-600 [writing-mode:vertical-lr]"
            style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
          >
            COPILOT
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="copilot-panel"
      className="flex h-full w-[300px] shrink-0 flex-col border-l border-gray-200 bg-slate-50 shadow-sm"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
          <h2 className="text-sm font-semibold text-slate-800">
            Clinical Copilot
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {/* Clear chat */}
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Clear chat"
            aria-label="Clear chat"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          {/* Close */}
          <button
            type="button"
            onClick={togglePanel}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Close panel"
            aria-label="Close panel"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-full bg-blue-50 p-3">
              <svg
                className="h-8 w-8 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <p className="mb-1 text-sm font-medium text-slate-500">
              Clinical Copilot
            </p>
            <p className="max-w-[220px] text-xs leading-relaxed text-slate-400">
              Ask me about the current EEG, request protocol suggestions, or get
              help interpreting findings.
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                citationCount={
                  message.role === "assistant" ? citations.length : 0
                }
                onCopyToReport={
                  message.role === "assistant" ? copyToReport : undefined
                }
              />
            ))}
            {isLoading && (
              <div className="mb-3 flex w-full justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-blue-400"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-blue-400"
                      style={{ animationDelay: "300ms" }}
                    />
                    <span className="ml-1 text-xs text-slate-400">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Citations footer */}
      {messages.length > 0 && <CitationsFooter citations={citations} />}

      {/* Suggestion chips */}
      <SuggestionChips onSelect={handleSuggestionSelect} disabled={isLoading} />

      {/* Chat input */}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        value={inputValue}
        onChange={handleInputChange}
      />
    </div>
  );
}
