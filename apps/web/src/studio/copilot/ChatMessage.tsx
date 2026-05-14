/**
 * ChatMessage — DeepSynaps Protocol Studio
 * =========================================
 * Renders an AI or user chat message with copy functionality
 * and expandable citations display.
 */

import React, { useState, useCallback } from "react";
import type { AiMessage } from "./types";

interface ChatMessageProps {
  message: AiMessage;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  const isUser = message.role === "user";
  const hasCitations = message.citations && message.citations.length > 0;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silently fail
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [message.content]);

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      data-testid={`chat-message-${message.id}`}
      data-role={message.role}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-green-100 text-green-800 border border-green-200"
        }`}
        data-testid={`message-avatar-${message.id}`}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Message bubble */}
      <div className={`flex-1 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`relative rounded-lg px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-800 border border-gray-200"
          }`}
          data-testid={`message-bubble-${message.id}`}
        >
          {/* Copy button */}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 focus:opacity-100 transition-opacity"
              data-testid={`copy-btn-${message.id}`}
              title="Copy message"
            >
              <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {copied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
            </button>
          )}

          <div className={!isUser ? "pr-6" : ""}>{message.content}</div>

          {/* Streaming indicator */}
          {message.isStreaming && (
            <span className="inline-flex gap-1 mt-1" data-testid={`streaming-indicator-${message.id}`}>
              <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>

        {/* Citations */}
        {hasCitations && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowCitations((prev) => !prev)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              data-testid={`toggle-citations-${message.id}`}
            >
              {showCitations ? "Hide" : "Show"} {message.citations!.length} citation{message.citations!.length > 1 ? "s" : ""}
            </button>
            {showCitations && (
              <ul
                className="mt-1.5 space-y-1.5 p-2 bg-blue-50 rounded-md border border-blue-100"
                data-testid={`citations-list-${message.id}`}
              >
                {message.citations!.map((cite) => (
                  <li key={cite.id} className="text-xs" data-testid={`citation-${cite.id}`}>
                    <p className="font-medium text-gray-800">{cite.title}</p>
                    <p className="text-gray-500">
                      {cite.authors} ({cite.year}) · <em>{cite.source}</em>
                    </p>
                    {cite.quote && (
                      <p className="text-gray-600 italic mt-0.5 border-l-2 border-blue-300 pl-2">
                        &ldquo;{cite.quote}&rdquo;
                      </p>
                    )}
                    {cite.url && (
                      <a
                        href={cite.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline mt-0.5 inline-block"
                      >
                        View source ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-gray-400 mt-1 block" data-testid={`message-timestamp-${message.id}`}>
          {message.timestamp}
        </span>

        {/* Copy feedback */}
        {copied && (
          <span className="text-xs text-green-600 mt-0.5 block" data-testid={`copy-feedback-${message.id}`}>
            Copied!
          </span>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
