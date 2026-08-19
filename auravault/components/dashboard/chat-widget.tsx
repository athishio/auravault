"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Mic, MicOff, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://auravault-ai.onrender.com";

type Message = { role: string; content: string };

const DEFAULT_MESSAGE = { role: "ai", content: "Hello! I am your AuraVault AI. Tell me what you want to work on." };
const formatMessage = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-bold text-inherit">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

export function ChatWidget() {
  const { isLoaded, userId, getToken } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([DEFAULT_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null); 

  const handleClose = () => {
    setIsOpen(false);
    setMessages([DEFAULT_MESSAGE]); 
    setSessionId(""); 
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }
  };

  const handleOpen = () => {
    if (!sessionId) setSessionId(Date.now().toString());
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isRecording]);

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
      alert("Your browser does not support voice recognition. Please use supported browser.");
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

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const syncToAdvisor = (updatedMessages: Message[], userText: string) => {
    const savedChats = JSON.parse(localStorage.getItem("auraVault_aiChats") || "[]");
    const existingIndex = savedChats.findIndex((c: any) => c.id === sessionId);

    let chatTitle = userText.slice(0, 20) + "...";
    if (existingIndex >= 0) {
       chatTitle = savedChats[existingIndex].title !== "New Chat" ? savedChats[existingIndex].title : chatTitle;
    }

    const chatToSave = {
      id: sessionId,
      title: chatTitle,
      messages: updatedMessages,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      savedChats[existingIndex] = chatToSave;
    } else {
      savedChats.unshift(chatToSave);
    }

    localStorage.setItem("auraVault_aiChats", JSON.stringify(savedChats));
    window.dispatchEvent(new Event("aiHistoryUpdated"));
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    const userText = input;
    setInput("");
    
    const messagesWithUser = [...messages, { role: "user", content: userText }];
    setMessages(messagesWithUser);
    syncToAdvisor(messagesWithUser, userText);
    setIsLoading(true);

    try {
      const token = await getToken();
      const userCurrencyKey = `auraVault_${userId}_currency`;
      const userCurrencyCode = localStorage.getItem(userCurrencyKey) || localStorage.getItem("auraVault_currency") || "usd";
      
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userText,
          currency_code: userCurrencyCode, 
          history: messages.length > 1 ? messages.slice(1) : [] 
        }),
      });
      const data = await response.json();
      const messagesWithAI = [...messagesWithUser, { role: "ai", content: data.reply || "Error." }];
      setMessages(messagesWithAI);
      syncToAdvisor(messagesWithAI, userText);
      
      window.dispatchEvent(new Event("searchTransactions"));
    } catch (error) {
      console.error("Connection Error:", error);
      setMessages((prev) => [...prev, { role: "ai", content: "System error: Could not connect to backend." }]);
    } finally {
      setIsLoading(false);
    }
   };

  return (
    <>
      <div className={`fixed bottom-6 right-6 z-40 ${isOpen ? "hidden" : "flex"} items-center justify-center w-14 h-14`}>
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping pointer-events-none"></span>
        <button
          onClick={handleOpen}
          className="relative w-full h-full bg-emerald-500 hover:bg-emerald-600 text-black rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 z-10"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>

      {isOpen && (
        <div 
          ref={chatRef} 
          className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[500px] bg-sidebar border border-sidebar-border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200"
        >
          <div className="p-4 border-b border-sidebar-border flex items-center justify-between bg-sidebar-accent/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">AuraVault AI</h3>
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online & Listening
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1.5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed max-w-[85%] ${
                  msg.role === "user" ? "bg-emerald-500 text-black rounded-br-sm" : "bg-sidebar border border-sidebar-border text-foreground rounded-bl-sm"
                }`}>
                  {msg.role === "ai" ? formatMessage(msg.content) : msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl bg-sidebar border border-sidebar-border rounded-bl-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Analyzing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-sidebar-border bg-sidebar relative z-50">
            <form onSubmit={handleSend} className="flex items-center gap-2 relative">
              <div className="absolute left-2 flex items-center justify-center w-8 h-8">
                {isRecording && (
                  <span className="absolute w-8 h-8 rounded-full bg-red-500 opacity-60 animate-ping pointer-events-none"></span>
                )}
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`relative z-10 p-1.5 rounded-full transition-colors ${
                    isRecording ? "text-red-500" : "text-muted-foreground hover:text-emerald-500"
                  }`}
                >
                  {isRecording ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
              </div>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRecording ? "Listening..." : "Type or speak your message..."}
                className={`flex-1 bg-background border border-sidebar-border rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all ${
                  isRecording ? "border-red-500/50 ring-1 ring-red-500/20" : ""
                }`}
              />

              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2 p-1.5 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}