import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiCreateRequest, apiPreviewRequest } from '../api/client';
import { ExamplePromptChips } from '../components/request/ExamplePromptChips';
import { Sparkles, Bot, ArrowRight, Mic, MicOff, AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { formatCurrency } from '../utils/format';

export const NewRequest: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [requestText, setRequestText] = useState(() => searchParams.get('prompt') || '');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high'>('normal');
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-flight preview state
  const [preview, setPreview] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Voice input state (Web Speech API)
  const [isListening, setIsListening] = useState(false);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  const recognitionRef = useRef<any>(null);

  const navigate = useNavigate();

  useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setHasSpeechSupport(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setRequestText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  useEffect(() => {
    const promptParam = searchParams.get('prompt');
    if (promptParam) {
      setRequestText(promptParam);
    }
  }, [searchParams]);

  // Debounced (600ms) Pre-flight Preview
  useEffect(() => {
    const trimmed = requestText.trim();
    if (trimmed.length < 5) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsPreviewLoading(true);
      apiPreviewRequest({ requestText: trimmed, justification: justification.trim() || undefined })
        .then((data) => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setIsPreviewLoading(false));
    }, 600);

    return () => clearTimeout(timer);
  }, [requestText, justification]);

  const handleSelectExample = (
    text: string,
    urgencyVal: 'low' | 'normal' | 'high',
    justificationVal?: string
  ) => {
    setRequestText(text);
    setUrgency(urgencyVal);
    setJustification(justificationVal || '');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = requestText.trim();
    if (trimmed.length < 15 || trimmed.length > 1000) {
      setError('Purchase request must be between 15 and 1000 characters.');
      return;
    }
    if (justification.trim().length > 500) {
      setError('Justification must be at most 500 characters.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { runId } = await apiCreateRequest({
        requestText: trimmed,
        urgency,
        justification: justification.trim() || undefined
      });

      navigate(`/runs/${runId}`);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message || err.message || 'Failed to submit procurement request.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold mb-2">
          <Bot className="w-3.5 h-3.5" />
          <span>Autonomous 7-Agent Submission</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Create Purchase Request</h1>
        <p className="text-xs text-slate-400 mt-1">
          Describe what you need in plain English. Our 7 specialised agents (Orchestrator, Policy,
          Budget, Vendor, Approval, Execution, Auditor) will plan, verify policy &amp; FY 2026
          budget in INR (₹), rank approved vendors, verify live stock, and issue an ERP Purchase
          Order.
        </p>
      </div>

      {/* Clickable Example Chips */}
      <ExamplePromptChips onSelect={handleSelectExample} />

      {/* Main Request Form */}
      <div className="glass-panel p-8 rounded-3xl border border-slate-800 shadow-xl">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="requestText"
                className="block text-xs font-bold text-slate-200 uppercase tracking-wider"
              >
                Purchase Intent (Natural Language, 15–1000 chars)
              </label>
              <div className="flex items-center gap-3">
                {hasSpeechSupport && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
                      isListening
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                    title="Voice input (en-IN)"
                  >
                    {isListening ? (
                      <>
                        <MicOff className="w-3.5 h-3.5" />
                        <span>Listening...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Voice (en-IN)</span>
                      </>
                    )}
                  </button>
                )}
                <span className="text-[11px] font-mono text-slate-500">
                  {requestText.trim().length} / 1000
                </span>
              </div>
            </div>
            <textarea
              id="requestText"
              rows={4}
              required
              minLength={15}
              maxLength={1000}
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="e.g., I need 10 laptops for the new design team, budget around ₹12 lakh, needed in 3 weeks."
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans leading-relaxed"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Include item name, quantity, optional budget in ₹ (or lakhs), and delivery timeline.
            </p>

            {/* Debounced Pre-Flight Preview Card */}
            {preview && (
              <div className="mt-4 p-4 rounded-2xl bg-slate-900/90 border border-indigo-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    {isPreviewLoading ? (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    )}
                    Pre-Flight Policy & Budget Preview
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {preview.disclaimer}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Category:</span>
                    <strong className="text-slate-200">{preview.category || 'Unknown'}</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Estimated Cost Range:</span>
                    <strong className="text-emerald-400 font-mono">
                      {preview.estimatedCostRange
                        ? `${formatCurrency(preview.estimatedCostRange.min)} – ${formatCurrency(
                            preview.estimatedCostRange.max
                          )}`
                        : 'Custom / RFQ'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Expected Approval:</span>
                    <strong
                      className={`capitalize ${
                        preview.expectedRoute === 'auto'
                          ? 'text-emerald-400'
                          : preview.expectedRoute === 'manager'
                          ? 'text-amber-400'
                          : preview.expectedRoute === 'finance'
                          ? 'text-violet-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {preview.expectedRoute || 'Analyzing...'}
                    </strong>
                  </div>
                </div>

                {preview.warnings && preview.warnings.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    {preview.warnings.map((w: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-amber-400 text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                Priority / Urgency Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'normal', 'high'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setUrgency(level)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                      urgency === level
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="justification"
                  className="block text-xs font-bold text-slate-200 uppercase tracking-wider"
                >
                  Business Justification (Optional)
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  {justification.length} / 500
                </span>
              </div>
              <input
                id="justification"
                type="text"
                maxLength={500}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Recommended for spend above ₹1,00,000"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Deterministic guardrails enforce INR policy thresholds, budget limits, and vendor
              approval rules.
            </span>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Launching Agents...' : 'Execute Autonomous Flow'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
