"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
export default function Messages() { 
const [conversations, setConversations] = useState<any[]>([]);
const [selectedConversation, setSelectedConversation] = useState<any>(null);
const [messages, setMessages] = useState<any[]>([]);
const [currentUserId, setCurrentUserId] = useState(""); 

useEffect(() => {
  loadCurrentUser();
  loadConversations();
}, []);

async function loadCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    setCurrentUserId(user.id);
  }
}

async function loadConversations() {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("created_at", { ascending: false });

  if (!error && data) {
    setConversations(data);
  }
}
async function loadMessages(conversationId: number) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (!error && data) {
    setMessages(data);
  }
}


  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-5xl font-bold text-green-700 mb-8">
          Messages
        </h1>

        <div className="grid md:grid-cols-3 gap-6">

          <div className="bg-white rounded-2xl shadow-md p-4">
            <h2 className="text-xl font-bold mb-4">
              Conversations
            </h2>

            <div className="space-y-4">
              {conversations.map((conversation) => (
  <div
    key={conversation.id}
    onClick={() => {
  setSelectedConversation(conversation);
  loadMessages(conversation.id);
}}
    className="border p-3 rounded-lg cursor-pointer hover:bg-gray-100"
  >
    {conversation.sender_type} #{conversation.id}
  </div>
))}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl shadow-md p-6">

            <h2 className="text-xl font-bold mb-6">
              FC Bombonera
            </h2>

            <div className="space-y-4 h-96 overflow-y-auto">

              {messages.map((message) => (
    <>
      <div
        key={message.id}
        className={
          message.sender_id === selectedConversation?.scout_id
            ? "bg-gray-100 p-3 rounded-lg w-fit"
            : "bg-green-600 text-white p-3 rounded-lg w-fit ml-auto"
        }
      >
        {message.message}
      </div>
    </>
  ))}

</div>

            <div className="flex gap-3 mt-6">

              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 border rounded-lg p-3"
              />

              <button className="bg-green-600 text-white px-6 rounded-lg">
                Send
              </button>

            </div>

          </div>

        </div>

      </div>
    </main>
  );
}