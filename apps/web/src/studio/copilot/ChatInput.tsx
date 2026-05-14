import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export function ChatInput({
  onSend,
  isLoading = false,
  disabled = false,
  value: externalValue,
  onChange,
}: ChatInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const isControlled = externalValue !== undefined;
  const value = isControlled ? externalValue : internalValue;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 128); // max 4 rows (~128px)
    el.style.height = `${newHeight}px`;
  }, [value]);

  const setValue = useCallback(
    (v: string) => {
      if (isControlled) {
        onChange?.(v);
      } else {
        setInternalValue(v);
      }
    },
    [isControlled, onChange]
  );

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || isLoading || disabled) return;
      onSend(trimmed);
      setValue("");
      // Reset height
      const el = textareaRef.current;
      if (el) el.style.height = "auto";
    },
    [value, isLoading, disabled, onSend, setValue]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        const el = textareaRef.current;
        if (el) el.style.height = "auto";
      }
    },
    [handleSubmit, setValue]
  );

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="copilot-chat-input"
      className="border-t border-gray-200 bg-white px-3 py-2"
    >
      <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this EEG, request a protocol suggestion..."
          disabled={isLoading || disabled}
          rows={1}
          className="min-h-[36px] w-full resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-50"
          aria-label="Chat message"
          aria-describedby="chat-input-hint"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim() || disabled}
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isLoading ? "Sending..." : "Send message"}
        >
          {isLoading ? (
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
      </div>
      <p id="chat-input-hint" className="mt-1 text-center text-[10px] text-slate-400">
        Ctrl+Enter to send &middot; Esc to clear
      </p>
    </form>
  );
}
