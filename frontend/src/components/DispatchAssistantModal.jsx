import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bot, Send, User, AlertTriangle, Check, X, Wrench, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { Modal, Spinner } from './ui'

export default function DispatchAssistantModal({ onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I am your Dispatch AI Assistant. I can find nearest vehicles, create geofence alert zones, and assign orders with confirmation safety.',
    },
  ])
  const [input, setInput] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState(null)

  const chatMutation = useMutation({
    mutationFn: payload => api.post('/dispatch/assistant/chat', payload).then(r => r.data),
    onSuccess: data => {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          toolCalls: data.tool_calls,
          requiresConfirmation: data.requires_confirmation,
          actionToConfirm: data.action_to_confirm,
        },
      ])

      if (data.requires_confirmation) {
        setPendingConfirm({
          prompt: data.action_to_confirm,
          originalMessage: input,
        })
      } else {
        setPendingConfirm(null)
      }
    },
    onError: () => {
      toast.error('Assistant request failed')
    },
  })

  function handleSend(e) {
    e?.preventDefault()
    if (!input.trim() || chatMutation.isPending) return

    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])

    chatMutation.mutate({
      message: userMsg,
      history: messages.map(m => ({ role: m.role, content: m.content })),
    })
  }

  function handleConfirmAction(action) {
    setMessages(prev => [...prev, { role: 'user', content: `[CONFIRMED ACTION] ${action}` }])
    chatMutation.mutate({
      message: 'Confirmed execution',
      confirm_action: action,
    })
    setPendingConfirm(null)
  }

  return (
    <Modal title="Dispatch AI Assistant" onClose={onClose}>
      <div className="flex flex-col h-[480px] bg-app-panel rounded-xl overflow-hidden border border-app-border">
        {/* Messages History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 text-xs ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                  <Bot size={16} />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-xl p-3 space-y-2 ${
                  m.role === 'user'
                    ? 'bg-primary text-white font-medium'
                    : 'bg-app-surface border border-app-border text-heading'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>

                {/* Render executed tool calls */}
                {m.toolCalls?.length > 0 && (
                  <div className="pt-2 border-t border-app-border space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
                      <Wrench size={12} /> Executed Tool Calls:
                    </p>
                    {m.toolCalls.map((tc, i) => (
                      <div key={i} className="text-[11px] font-mono bg-app-panel px-2 py-1 rounded border border-app-border text-emerald-400">
                        {tc.tool}()
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center flex-shrink-0">
                  <User size={14} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Confirmation Gate for Destructive Actions */}
        {pendingConfirm && (
          <div className="p-3 bg-amber-500/10 border-t border-b border-amber-500/20 flex items-center justify-between gap-3 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
              <span>Confirm execution of destructive action?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPendingConfirm(null)}
                className="btn-ghost text-xs py-1 px-2 text-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmAction(pendingConfirm.prompt)}
                className="btn-primary text-xs py-1 px-3 bg-amber-500 hover:bg-amber-600 border-none text-black font-bold flex items-center gap-1"
              >
                <Check size={14} /> Confirm & Execute
              </button>
            </div>
          </div>
        )}

        {/* Suggested Prompts */}
        <div className="p-2 bg-app-surface border-t border-app-border flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
          <span className="text-muted font-semibold flex items-center gap-1 text-[11px] flex-shrink-0">
            <Sparkles size={12} /> Quick Prompts:
          </span>
          {[
            'Find nearest vehicle to Delhi Hub',
            'Create 500m geofence for Depot',
            'Assign order 101 to nearest truck',
          ].map(prompt => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              className="px-2.5 py-1 rounded-full bg-app-panel border border-app-border text-muted hover:text-heading hover:border-primary transition-colors flex-shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <form onSubmit={handleSend} className="p-3 bg-app-surface border-t border-app-border flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask AI Assistant (e.g. 'Find nearest truck to Delhi Hub')..."
            value={input}
            onChange={e => setInput(e.target.value)}
            className="input flex-1 text-xs py-2"
          />
          <button
            type="submit"
            disabled={chatMutation.isPending || !input.trim()}
            className="btn-primary py-2 px-4"
          >
            {chatMutation.isPending ? <Spinner size="sm" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </Modal>
  )
}
