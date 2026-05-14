/**
 * ChatMessage Tests — DeepSynaps Protocol Studio
 * ===============================================
 * Tests message rendering, copy button, and citations display.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatMessage } from "../../copilot/ChatMessage";
import { createMockAiMessage, createMockAiMessage as mockMsg } from "../utils/protocolMockData";

describe("ChatMessage", () => {
  it("renders an assistant message with correct role attribute", () => {
    const message = createMockAiMessage({ role: "assistant" });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`chat-message-${message.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`chat-message-${message.id}`)).toHaveAttribute("data-role", "assistant");
    expect(screen.getByTestId(`message-bubble-${message.id}`)).toHaveTextContent(message.content);
  });

  it("renders a user message with correct role attribute", () => {
    const message = mockMsg({ role: "user", content: "What treatment do you recommend?" });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`chat-message-${message.id}`)).toHaveAttribute("data-role", "user");
    expect(screen.getByTestId(`message-bubble-${message.id}`)).toHaveTextContent(
      "What treatment do you recommend?"
    );
  });

  it("shows AI avatar for assistant messages", () => {
    const message = mockMsg({ role: "assistant" });
    render(<ChatMessage message={message} />);

    const avatar = screen.getByTestId(`message-avatar-${message.id}`);
    expect(avatar).toHaveTextContent("AI");
    expect(avatar.className).toContain("bg-green-100");
  });

  it("shows User avatar for user messages", () => {
    const message = mockMsg({ role: "user" });
    render(<ChatMessage message={message} />);

    const avatar = screen.getByTestId(`message-avatar-${message.id}`);
    expect(avatar).toHaveTextContent("U");
    expect(avatar.className).toContain("bg-blue-600");
  });

  it("displays the message timestamp", () => {
    const message = mockMsg({ timestamp: "2024-12-18T10:30:00Z" });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`message-timestamp-${message.id}`)).toHaveTextContent(
      "2024-12-18T10:30:00Z"
    );
  });

  it("shows copy button for assistant messages", () => {
    const message = mockMsg({ role: "assistant" });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`copy-btn-${message.id}`)).toBeInTheDocument();
  });

  it("does not show copy button for user messages", () => {
    const message = mockMsg({ role: "user" });
    render(<ChatMessage message={message} />);

    expect(screen.queryByTestId(`copy-btn-${message.id}`)).not.toBeInTheDocument();
  });

  it("copies message content to clipboard when copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const message = mockMsg({ role: "assistant", content: "Copy this text" });
    render(<ChatMessage message={message} />);

    fireEvent.click(screen.getByTestId(`copy-btn-${message.id}`));

    expect(writeText).toHaveBeenCalledWith("Copy this text");
  });

  it("shows copied feedback after clicking copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const message = mockMsg({ role: "assistant" });
    render(<ChatMessage message={message} />);

    fireEvent.click(screen.getByTestId(`copy-btn-${message.id}`));

    expect(await screen.findByTestId(`copy-feedback-${message.id}`)).toHaveTextContent("Copied!");
  });

  it("displays citations toggle when message has citations", () => {
    const message = mockMsg({
      citations: [
        {
          id: "cite-001",
          title: "Test Citation",
          authors: "Smith J, Doe A",
          year: 2023,
          source: "Journal of Neuroscience",
          quote: "Relevant finding here",
        },
      ],
    });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`toggle-citations-${message.id}`)).toHaveTextContent("Show 1 citation");
  });

  it("expands citations when toggle is clicked", () => {
    const message = mockMsg({
      citations: [
        {
          id: "cite-001",
          title: "Test Citation Title",
          authors: "Smith J",
          year: 2023,
          source: "Journal of Neuroscience",
          quote: "A key finding was observed.",
        },
      ],
    });
    render(<ChatMessage message={message} />);

    expect(
      screen.queryByTestId(`citations-list-${message.id}`)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`toggle-citations-${message.id}`));

    const citationsList = screen.getByTestId(`citations-list-${message.id}`);
    expect(citationsList).toBeInTheDocument();
    expect(citationsList).toHaveTextContent("Test Citation Title");
    expect(citationsList).toHaveTextContent("Smith J (2023)");
    expect(citationsList).toHaveTextContent("A key finding was observed.");
  });

  it("hides citations when toggled again after being expanded", () => {
    const message = mockMsg({
      citations: [
        {
          id: "cite-001",
          title: "Test Citation",
          authors: "Smith J",
          year: 2023,
          source: "Journal",
        },
      ],
    });
    render(<ChatMessage message={message} />);

    fireEvent.click(screen.getByTestId(`toggle-citations-${message.id}`));
    expect(screen.getByTestId(`citations-list-${message.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`toggle-citations-${message.id}`));
    expect(
      screen.queryByTestId(`citations-list-${message.id}`)
    ).not.toBeInTheDocument();
  });

  it("renders toggle with plural 'citations' when multiple citations exist", () => {
    const message = mockMsg({
      citations: [
        { id: "cite-001", title: "Cite 1", authors: "A", year: 2023, source: "J1" },
        { id: "cite-002", title: "Cite 2", authors: "B", year: 2022, source: "J2" },
      ],
    });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`toggle-citations-${message.id}`)).toHaveTextContent(
      "Show 2 citations"
    );
  });

  it("displays streaming indicator when isStreaming is true", () => {
    const message = mockMsg({ isStreaming: true });
    render(<ChatMessage message={message} />);

    expect(screen.getByTestId(`streaming-indicator-${message.id}`)).toBeInTheDocument();
  });

  it("does not display streaming indicator when isStreaming is false", () => {
    const message = mockMsg({ isStreaming: false });
    render(<ChatMessage message={message} />);

    expect(
      screen.queryByTestId(`streaming-indicator-${message.id}`)
    ).not.toBeInTheDocument();
  });

  it("handles clipboard write failure gracefully", () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard failed"));
    Object.assign(navigator, { clipboard: { writeText } });

    const message = mockMsg({ role: "assistant", content: "Test" });
    render(<ChatMessage message={message} />);

    // Should not throw
    fireEvent.click(screen.getByTestId(`copy-btn-${message.id}`));
  });

  it("does not render citations toggle when message has no citations", () => {
    const message = mockMsg({ citations: undefined });
    render(<ChatMessage message={message} />);

    expect(
      screen.queryByTestId(`toggle-citations-${message.id}`)
    ).not.toBeInTheDocument();
  });
});
