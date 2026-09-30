import { useState } from "react";
import { PromptChipsBar, type PromptChip } from "@delegolabs/ui";

export interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  onSendQuery: (query: string) => void;
  activeOrders?: boolean;
}

export function ChatDrawer({ open, onClose, onSendQuery, activeOrders = false }: ChatDrawerProps) {
  const [inputValue, setInputValue] = useState("");
  const [conversationStarted, setConversationStarted] = useState(false);

  if (!open) return null;

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    onSendQuery(text);
    setInputValue("");
    setConversationStarted(true);
  };

  const handleChipSelect = (promptText: string) => {
    setInputValue(promptText);
    handleSend(promptText);
  };

  const suggestedChips: PromptChip[] = [
    { id: "1", label: "Find mechanical keyboards under $100", promptText: "Find mechanical keyboards under $100", category: "search" },
    { id: "2", label: "Check delivery status", promptText: "Check delivery status", category: "orders" },
    ...(activeOrders ? [{ id: "3", label: "Open dispute for active order", promptText: "Open dispute for active order", category: "disputes" } as PromptChip] : [])
  ];

  return (
    <div className="chat-drawer-overlay" onClick={onClose}>
      <div className="chat-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="chat-drawer-header">
          <h2>Chat with Agent</h2>
          <button onClick={onClose} aria-label="Close">X</button>
        </div>
        <div className="chat-drawer-body">
          {/* Conversation messages would go here */}
        </div>
        <div className="chat-drawer-footer">
          {!conversationStarted && suggestedChips.length > 0 && (
            <PromptChipsBar chips={suggestedChips} onSelect={handleChipSelect} />
          )}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSend(inputValue);
              }
            }}
            placeholder="Type a message..."
            className="chat-input-box"
          />
        </div>
      </div>
    </div>
  );
}
