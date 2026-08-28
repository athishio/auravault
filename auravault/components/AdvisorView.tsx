"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Trash2, PlusCircle, MessageSquare, Pencil } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://auravault-ai.onrender.com";

const formatMessage = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

const DEFAULT_MESSAGE = {
  role: "ai",
  content: "Welcome to your AuraVault AI. I'm ready to analyze your spending. What are we working on today?"
};

type Message = { role: string; content: string };
type ChatSession = { id: string; title: string; messages: Message[]; updatedAt: number };

export function AdvisorView() {
  const userId = "primary_user";

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          setInput(currentTranscript);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Your browser does not support voice recognition. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    if (isRecording) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.warn("Microphone was already stopping.");
      }
      setIsRecording(false);
    } else {
      setInput(""); 
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.warn("Microphone is already listening!");
        setIsRecording(true); 
      }
    }
  };

  const reloadFromStorage = () => {
    const savedChatsStr = localStorage.getItem("auraVault_aiChats");
    let parsed = savedChatsStr ? JSON.parse(savedChatsStr) : [];

    const cleanChats = parsed.filter((c: ChatSession) => c.messages.length > 1 || c.title !== "New Chat");
    if (cleanChats.length !== parsed.length) {
      localStorage.setItem("auraVault_aiChats", JSON.stringify(cleanChats));
    }

    if (cleanChats.length > 0) {
      setChats(cleanChats);
      setActiveChatId(currentId => {
        if (!currentId || !cleanChats.find((c: ChatSession) => c.id === currentId)) {
          return cleanChats[0].id;
        }
        return currentId;
      });
    } else {
      const newChat: ChatSession = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [DEFAULT_MESSAGE],
        updatedAt: Date.now()
      };
      setChats([newChat]);
      setActiveChatId(newChat.id);
    }
  };

  useEffect(() => {
    reloadFromStorage();
    window.addEventListener("aiHistoryUpdated", reloadFromStorage);
    return () => {
      window.removeEventListener("aiHistoryUpdated", reloadFromStorage);
    };
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages]);

  const saveAllChats = (newChats: ChatSession[], newActiveId: string) => {
    setChats(newChats);
    setActiveChatId(newActiveId);

    const chatsToSave = newChats.filter(c => c.messages.length > 1 || c.title !== "New Chat");
    localStorage.setItem("auraVault_aiChats", JSON.stringify(chatsToSave));
  };

  const handleSelectChat = (id: string) => {
    const currentChat = chats.find(c => c.id === activeChatId);
    if (currentChat && currentChat.messages.length <= 1 && currentChat.title === "New Chat" && activeChatId !== id) {
      setChats(chats.filter(c => c.id !== activeChatId));
    }
    setActiveChatId(id);
  };

  const handleNewChat = () => {
    const hasEmptyChat = chats.find(c => c.messages.length <= 1 && c.title === "New Chat");
    if (hasEmptyChat) {
      setActiveChatId(hasEmptyChat.id);
      return;
    }

    const newChat: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [DEFAULT_MESSAGE],
      updatedAt: Date.now()
    };
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
  };

  const handleDeleteChat = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedChats = chats.filter(c => c.id !== idToDelete);

    if (updatedChats.length === 0) {
      const newChat: ChatSession = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [DEFAULT_MESSAGE],
        updatedAt: Date.now()
      };
      setChats([newChat]);
      setActiveChatId(newChat.id);
      localStorage.setItem("auraVault_aiChats", JSON.stringify([]));
    } else {
      const nextActiveId = activeChatId === idToDelete ? updatedChats[0].id : activeChatId;
      saveAllChats(updatedChats, nextActiveId);
    }
  };

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (id: string, e?: React.FocusEvent | React.KeyboardEvent | React.FormEvent) => {
    if (e) e.stopPropagation();
    const updatedChats = chats.map(chat =>
      chat.id === id ? { ...chat, title: editTitle || "Unnamed Chat" } : chat
    );
    saveAllChats(updatedChats, activeChatId);
    setEditingChatId(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChat) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    const userText = input;
    setInput("");

    let chatTitle = activeChat.title;
    if (activeChat.messages.length <= 1 && chatTitle === "New Chat") {
      chatTitle = userText.slice(0, 20) + (userText.length > 20 ? "..." : "");
    }

    const updatedMessages = [...activeChat.messages, { role: "user", content: userText }];

    let updatedChats = chats.map(chat =>
      chat.id === activeChatId
        ? { ...chat, title: chatTitle, messages: updatedMessages, updatedAt: Date.now() }
        : chat
    );

    saveAllChats(updatedChats, activeChatId);
    setIsLoading(true);

    try {
      const apiSecret = process.env.NEXT_PUBLIC_API_SECRET || "";
      const userCurrencyKey = `auraVault_${userId}_currency`;
      const userCurrencyCode = localStorage.getItem(userCurrencyKey) || localStorage.getItem("auraVault_currency") || "usd";

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-API-Secret": apiSecret
        },
        body: JSON.stringify({
          message: userText,
          currency_code: userCurrencyCode, 
          history: activeChat.messages.length > 1 ? activeChat.messages.slice(1) : []
        }),
      });
      const data = await response.json();
      
      updatedChats = updatedChats.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: [...chat.messages, { role: "ai", content: data.reply || "Error processing request." }] }
          : chat
      );
      saveAllChats(updatedChats, activeChatId);

    } catch (error) {
      console.error("Connection Error:", error);
      updatedChats = updatedChats.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: [...chat.messages, { role: "ai", content: "System error: Could not connect to the backend." }] }
          : chat
      );
      saveAllChats(updatedChats, activeChatId);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full mt-6 bg-sidebar border border-sidebar-border rounded-xl overflow-hidden shadow-sm">

      <div className="w-64 bg-sidebar-accent/10 border-r border-sidebar-border flex flex-col hidden md:flex">
        <div className="p-4 border-b border-sidebar-border">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground mb-3 px-2">RECENT CHATS</p>
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => handleSelectChat(chat.id)}
              className={`group flex justify-between items-center px-2 py-3 rounded-lg cursor-pointer transition-colors ${
                activeChatId === chat.id
                  ? 'bg-sidebar-accent/50 text-emerald-500'
                  : 'hover:bg-sidebar-accent/30 text-foreground'
              }`}
            >
              {editingChatId === chat.id ? (
                <div className="flex items-center w-full gap-2">
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={(e) => handleSaveRename(chat.id, e)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(chat.id, e) }}
                    className="flex-1 bg-background border border-sidebar-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                    <span className="text-sm font-medium truncate">{chat.title}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleStartRename(chat.id, chat.title, e)}
                      className="text-muted-foreground hover:text-emerald-500 transition-colors p-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-background relative">
        <div className="p-5 border-b border-sidebar-border bg-sidebar flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">{activeChat?.title || "AI Advisor"}</h2>
          </div>
          <p className="text-xs text-emerald-500 font-medium px-2 py-1 bg-emerald-500/10 rounded-md">Connected</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeChat?.messages.map((msg, index) => (
            <div key={index} className={`flex max-w-3xl mx-auto ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm max-w-[85%] whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-emerald-500 text-black rounded-br-sm"
                    : "bg-sidebar text-foreground rounded-bl-sm border border-sidebar-border"
                }`}
              >
                {msg.role === "ai" ? formatMessage(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex max-w-3xl mx-auto justify-start">
              <div className="px-5 py-3.5 rounded-2xl bg-sidebar text-muted-foreground rounded-bl-sm border border-sidebar-border flex gap-1.5 items-center shadow-sm h-[48px]">
                <div className="w-2 h-2 bg-emerald-500/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-emerald-500/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-emerald-500/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-sidebar-border bg-sidebar">
          <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative flex items-center">
            
            <div className="absolute left-3 flex items-center justify-center z-10 w-9 h-9">
              {isRecording && (
                <span className="absolute w-10 h-10 rounded-full bg-red-500/40 animate-ping"></span>
              )}
              <button
                type="button"
                onClick={toggleRecording}
                className={`relative p-2 rounded-full transition-colors ${
                  isRecording ? "text-red-500" : "text-muted-foreground hover:text-emerald-500"
                }`}
              >
                {isRecording ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
            </div>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "Listening..." : "Ask AuraVault AI anything..."}
              className={`w-full bg-background border border-sidebar-border rounded-xl pl-12 pr-12 py-3.5 text-[15px] focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-foreground shadow-sm transition-all ${
                  isRecording ? "border-red-500/50 ring-1 ring-red-500/20" : ""
                }`}
            />
            
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 p-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}