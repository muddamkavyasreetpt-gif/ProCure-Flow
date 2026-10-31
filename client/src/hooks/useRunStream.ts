import { useState, useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { apiGetRun, RunDetailResponse } from '../api/client';
import { AgentStep, RunStatus } from '../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function useRunStream(runId: string | undefined) {
  const [runDetail, setRunDetail] = useState<RunDetailResponse | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<RunStatus>('running');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const lastSeqRef = useRef<number>(0);
  const pollingIntervalRef = useRef<any>(null);

  // Helper to get step order
  const getStepIndex = (s: AgentStep) => s.step_index ?? s.seq ?? 0;

  // Initial load
  useEffect(() => {
    if (!runId) return;

    let isMounted = true;
    apiGetRun(runId)
      .then((data) => {
        if (!isMounted) return;
        setRunDetail(data);
        setSteps(data.steps || []);
        setStatus(data.run.status);
        if (data.steps && data.steps.length > 0) {
          lastSeqRef.current = Math.max(...data.steps.map(getStepIndex));
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to fetch initial run data');
      });

    return () => {
      isMounted = false;
    };
  }, [runId]);

  // Fallback Polling Function
  const startPolling = (targetRunId: string) => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const data = await apiGetRun(targetRunId);
        setRunDetail(data);
        setSteps(data.steps || []);
        setStatus(data.run.status);
        if (['completed', 'rejected', 'failed'].includes(data.run.status)) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
    }, 2000);
  };

  // SSE Stream with @microsoft/fetch-event-source
  useEffect(() => {
    if (!runId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const ctrl = new AbortController();

    async function connectSSE() {
      try {
        await fetchEventSource(`${BASE_URL}/api/runs/${runId}/stream`, {
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            'Last-Event-ID': String(lastSeqRef.current)
          },
          onmessage(msg) {
            if (msg.event === 'step') {
              try {
                const step = JSON.parse(msg.data) as AgentStep;
                setSteps((prev) => {
                  const sIdx = getStepIndex(step);
                  const exists = prev.some((p) => getStepIndex(p) === sIdx);
                  if (exists) return prev;
                  const updated = [...prev, step].sort((a, b) => getStepIndex(a) - getStepIndex(b));
                  lastSeqRef.current = Math.max(lastSeqRef.current, sIdx);
                  return updated;
                });
              } catch (e) {
                console.error('Error parsing SSE step:', e);
              }
            } else if (msg.event === 'status') {
              try {
                const statusData = JSON.parse(msg.data);
                if (statusData.status) {
                  setStatus(statusData.status);
                }
              } catch (e) {
                console.error('Error parsing SSE status:', e);
              }
            } else if (msg.event === 'done') {
              if (runId) {
                apiGetRun(runId).then((data) => {
                  setRunDetail(data);
                  setStatus(data.run.status);
                });
              }
              setIsStreaming(false);
            }
          },
          onerror(err) {
            console.warn('SSE stream error, falling back to polling:', err);
            if (runId) startPolling(runId);
          }
        });
      } catch (err) {
        console.warn('SSE connection failed, starting fallback polling:', err);
        if (runId) startPolling(runId);
      }
    }

    connectSSE();

    return () => {
      ctrl.abort();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [runId]);

  return {
    runDetail,
    steps,
    status,
    isStreaming,
    error,
    refresh: () => {
      if (runId) {
        apiGetRun(runId).then((data) => {
          setRunDetail(data);
          setSteps(data.steps || []);
          setStatus(data.run.status);
        });
      }
    }
  };
}
