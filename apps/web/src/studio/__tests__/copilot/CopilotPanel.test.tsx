import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopilotPanel } from "../../copilot/CopilotPanel";
import { useAiStore } from "../../stores/ai";

// Mock crypto.randomUUID for tests
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: vi.fn(() => `mock-uuid-${Math.random().toString(36).slice(2)}`),
  },
  writable: true,
});

// Helper to reset the store between tests
function resetStore() {
  useAiStore.setState({
    messages: [],
    pendingSuggestions: [],
    citations: [],
    lastViewport: null,
    lastMontage: null,
    lastFilters: null,
    lastEvents: null,
    lastPatient: null,
    lastArtifactProposal: null,
    lastSpectraComputation: null,
    lastErpComputation: null,
    lastSourceLocalization: null,
    lastSpikeDetection: null,
    lastReportDraft: null,
    lastErpComputed: null,
  });
}

describe("CopilotPanel", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Panel visibility", () => {
    it("renders open by default with data-testid", () => {
      render(<CopilotPanel />);
      expect(screen.getByTestId("copilot-panel")).toBeInTheDocument();
      expect(screen.getByText("Clinical Copilot")).toBeInTheDocument();
    });

    it("shows empty state message when no messages", () => {
      render(<CopilotPanel />);
      expect(
        screen.getByText(
          /Ask me about the current EEG, request protocol suggestions/i
        )
      ).toBeInTheDocument();
    });

    it("collapses when close button is clicked", () => {
      render(<CopilotPanel />);
      const closeBtn = screen.getByLabelText("Close panel");
      fireEvent.click(closeBtn);

      // After closing, we should see the collapsed tab with vertical text
      expect(screen.getByText("COPILOT")).toBeInTheDocument();
    });

    it("reopens from collapsed tab", () => {
      render(<CopilotPanel />);

      // Close
      fireEvent.click(screen.getByLabelText("Close panel"));
      expect(screen.getByText("COPILOT")).toBeInTheDocument();

      // Reopen
      fireEvent.click(screen.getByLabelText("Open Clinical Copilot"));
      expect(screen.getByText("Clinical Copilot")).toBeInTheDocument();
    });
  });

  describe("Chat functionality", () => {
    it("sends a message when clicking send", async () => {
      render(<CopilotPanel />);
      const input = screen.getByLabelText("Chat message");

      await userEvent.type(input, "Hello copilot");
      fireEvent.click(screen.getByLabelText("Send message"));

      await waitFor(() => {
        expect(screen.getByText("Hello copilot")).toBeInTheDocument();
      });
    });

    it("sends a message with Ctrl+Enter keyboard shortcut", async () => {
      render(<CopilotPanel />);
      const input = screen.getByLabelText("Chat message");

      await userEvent.type(input, "Test message");
      fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

      await waitFor(() => {
        expect(screen.getByText("Test message")).toBeInTheDocument();
      });
    });

    it("clears input with Escape key", async () => {
      render(<CopilotPanel />);
      const input = screen.getByLabelText("Chat message") as HTMLTextAreaElement;

      await userEvent.type(input, "To be cleared");
      expect(input.value).toBe("To be cleared");

      fireEvent.keyDown(input, { key: "Escape" });
      expect(input.value).toBe("");
    });

    it("shows loading state while waiting for response", async () => {
      render(<CopilotPanel />);
      const input = screen.getByLabelText("Chat message");

      await userEvent.type(input, "Test");
      fireEvent.click(screen.getByLabelText("Send message"));

      expect(screen.getByLabelText("Sending...")).toBeInTheDocument();
    });

    it("disables send button when input is empty", () => {
      render(<CopilotPanel />);
      const sendBtn = screen.getByLabelText("Send message");
      expect(sendBtn).toBeDisabled();
    });
  });

  describe("Chat messages display", () => {
    it("renders user message bubble", async () => {
      render(<CopilotPanel />);
      const input = screen.getByLabelText("Chat message");

      await userEvent.type(input, "User question");
      fireEvent.click(screen.getByLabelText("Send message"));

      await waitFor(() => {
        const userMsg = screen.getByTestId("chat-message-user");
        expect(userMsg).toBeInTheDocument();
        expect(userMsg).toHaveTextContent("User question");
      });
    });

    it("renders assistant response after delay", async () => {
      render(<CopilotPanel />);
      const input = screen.getByLabelText("Chat message");

      await userEvent.type(input, "Generate protocol");
      fireEvent.click(screen.getByLabelText("Send message"));

      // Fast-forward past the simulated delay
      vi.advanceTimersByTime(1500);

      await waitFor(() => {
        const assistantMsg = screen.getByTestId("chat-message-assistant");
        expect(assistantMsg).toBeInTheDocument();
      });
    });

    it("renders system messages with correct styling", () => {
      useAiStore.setState({
        messages: [
          {
            id: "sys-1",
            role: "system",
            content: "System notification",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      render(<CopilotPanel />);
      const systemMsg = screen.getByTestId("chat-message-system");
      expect(systemMsg).toBeInTheDocument();
      expect(systemMsg).toHaveTextContent("System notification");
    });
  });

  describe("Clear chat", () => {
    it("clears all messages when clear button is clicked", async () => {
      useAiStore.setState({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Previous message",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      render(<CopilotPanel />);
      expect(screen.getByText("Previous message")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Clear chat"));

      await waitFor(() => {
        expect(screen.queryByText("Previous message")).not.toBeInTheDocument();
      });
    });

    it("shows empty state after clearing", async () => {
      useAiStore.setState({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "To be cleared",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      render(<CopilotPanel />);
      fireEvent.click(screen.getByLabelText("Clear chat"));

      await waitFor(() => {
        expect(
          screen.getByText(
            /Ask me about the current EEG, request protocol suggestions/i
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe("Suggestion chips", () => {
    it("renders default suggestions when no context", () => {
      render(<CopilotPanel />);

      // Send a message to get past empty state (chips are always visible when open with messages)
      // Default chips appear when there are no pending suggestions and no context
      expect(
        screen.getByTestId("suggestion-chip-Generate protocol")
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("suggestion-chip-Search evidence")
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("suggestion-chip-Interpret findings")
      ).toBeInTheDocument();
    });

    it("fills input when suggestion chip is clicked", async () => {
      render(<CopilotPanel />);

      const chip = screen.getByTestId("suggestion-chip-Generate protocol");
      fireEvent.click(chip);

      const input = screen.getByLabelText("Chat message") as HTMLTextAreaElement;
      expect(input.value).toBe("Generate protocol");
    });
  });

  describe("Citations", () => {
    it("shows citations footer when citations exist", async () => {
      useAiStore.setState({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Test",
            createdAt: new Date().toISOString(),
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "Response with citations",
            createdAt: new Date().toISOString(),
          },
        ],
        citations: [
          {
            id: "cit-1",
            label: "IFCN Standards for Digital EEG (2017)",
            href: "https://www.ifcn.info/standards",
          },
        ],
      });

      render(<CopilotPanel />);
      expect(screen.getByTestId("copilot-citations")).toBeInTheDocument();
      expect(screen.getByText("Evidence (1)")).toBeInTheDocument();
    });

    it("expands citations on click", async () => {
      useAiStore.setState({
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: "Test",
            createdAt: new Date().toISOString(),
          },
        ],
        citations: [
          {
            id: "cit-1",
            label: "IFCN Standards for Digital EEG (2017)",
            href: "https://www.ifcn.info/standards",
          },
        ],
      });

      render(<CopilotPanel />);
      fireEvent.click(screen.getByText("Evidence (1)"));

      await waitFor(() => {
        expect(
          screen.getByText("IFCN Standards for Digital EEG (2017)")
        ).toBeInTheDocument();
      });
    });

    it("hides citations footer when no citations", () => {
      useAiStore.setState({
        messages: [],
        citations: [],
      });

      render(<CopilotPanel />);
      expect(screen.queryByTestId("copilot-citations")).not.toBeInTheDocument();
    });
  });

  describe("Copy to report", () => {
    it("shows copy button on assistant messages", async () => {
      useAiStore.setState({
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: "Findings to copy",
            createdAt: new Date().toISOString(),
          },
        ],
        citations: [],
      });

      render(<CopilotPanel />);
      expect(screen.getByText("Copy to report")).toBeInTheDocument();
    });

    it("does not show copy button on user messages", () => {
      useAiStore.setState({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "User message",
            createdAt: new Date().toISOString(),
          },
        ],
        citations: [],
      });

      render(<CopilotPanel />);
      expect(screen.queryByText("Copy to report")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has ARIA live region for chat messages", () => {
      render(<CopilotPanel />);
      const log = screen.getByRole("log");
      expect(log).toHaveAttribute("aria-live", "polite");
      expect(log).toHaveAttribute("aria-label", "Chat messages");
    });

    it("input has accessible label", () => {
      render(<CopilotPanel />);
      expect(screen.getByLabelText("Chat message")).toBeInTheDocument();
    });

    it("keyboard hint is visible", () => {
      render(<CopilotPanel />);
      expect(screen.getByText(/Ctrl\+Enter to send/i)).toBeInTheDocument();
      expect(screen.getByText(/Esc to clear/i)).toBeInTheDocument();
    });
  });
});
