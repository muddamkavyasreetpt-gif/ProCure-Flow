import { ZodSchema } from 'zod';
import { ai, MODEL, isLiveLLMConfigured } from './gemini';
import { acquireLLMCapacity } from './limiter';
import { withRetry } from './retry';
import { ToolDefinition, RegisteredTool, ToolContext } from '../tools/types';
import { recordStep, StepAgent } from '../services/stepService';
import { env } from '../config/env';

export class AgentOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentOutputError';
  }
}

export interface RunAgentTurnParams<T> {
  agentName: StepAgent;
  systemInstruction: string;
  userPayload: string;
  toolDeclarations: ToolDefinition[];
  toolExecutors: Map<string, RegisteredTool>;
  ctx: ToolContext;
  schema: ZodSchema<T>;
  maxToolIterations?: number;
  fallbackFn: () => Promise<T>;
}

export interface RunAgentTurnResult<T> {
  data: T;
  fallback: boolean;
  durationMs: number;
  fallbackReason?: string;
}

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export async function runAgentTurn<T>(
  params: RunAgentTurnParams<T>
): Promise<RunAgentTurnResult<T>> {
  const {
    agentName,
    systemInstruction,
    userPayload,
    toolDeclarations,
    toolExecutors,
    ctx,
    schema,
    maxToolIterations = 3,
    fallbackFn
  } = params;

  // Deterministic mock mode
  if (!isLiveLLMConfigured()) {
    const start = Date.now();
    const data = await fallbackFn();
    return {
      data,
      fallback: true,
      durationMs: Math.max(25, Date.now() - start)
    };
  }

  let totalActiveMs = 0;

  try {
    const contents: any[] = [{ role: 'user', parts: [{ text: userPayload }] }];

    let iterations = 0;
    while (iterations < maxToolIterations) {
      iterations++;
      const cap = await acquireLLMCapacity();
      if (cap.waitMs > 3000) {
        await recordStep(ctx.runId, agentName, 'thought', {
          title: 'Waiting for model capacity…',
          rationale: `Queued ${(cap.waitMs / 1000).toFixed(1)}s for rate-limiter slot.`,
          durationMs: 0
        });
      }

      let response: any;
      const callStart = Date.now();
      try {
        response = await withRetry(() =>
          ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
              tools:
                toolDeclarations.length > 0
                  ? [{ functionDeclarations: toolDeclarations as any }]
                  : undefined
            }
          })
        );
      } catch (callErr) {
        cap.refundToken();
        throw callErr;
      } finally {
        totalActiveMs += Date.now() - callStart;
        cap.release();
      }

      const candidate = response?.candidates?.[0];
      const functionCalls = response?.functionCalls || [];

      if (!functionCalls || functionCalls.length === 0) {
        // Model finished without more tool calls; check if it already produced valid JSON
        const text = response?.text ? stripMarkdownFences(String(response.text)) : '';
        if (text) {
          try {
            const parsedJson = JSON.parse(text);
            const validated = schema.safeParse(parsedJson);
            if (validated.success) {
              return {
                data: validated.data,
                fallback: false,
                durationMs: totalActiveMs
              };
            }
          } catch {
            // Fall through to explicit JSON final turn
          }
        }
        if (candidate?.content) {
          contents.push(candidate.content);
        }
        break;
      }

      // Preserve model candidate content verbatim (including thought signatures)
      if (candidate?.content) {
        contents.push(candidate.content);
      }

      // Execute parallel function calls in one turn using ONLY allowed tools for this agent
      const responseParts = await Promise.all(
        functionCalls.map(async (fc: any) => {
          const toolName = String(fc.name || '');
          const rawArgs = (fc.args || {}) as Record<string, unknown>;
          const toolStart = Date.now();

          await recordStep(ctx.runId, agentName, 'tool_call', {
            title: `Calling ${toolName}`,
            input: rawArgs,
            durationMs: 0
          });

          const registered = toolExecutors.get(toolName);
          let toolResult: Record<string, unknown>;

          if (!registered) {
            toolResult = {
              success: false,
              error: `Tool "${toolName}" is not allowed for agent "${agentName}".`
            };
          } else {
            const argValidation = registered.schema.safeParse(rawArgs);
            if (!argValidation.success) {
              toolResult = {
                success: false,
                error: `Invalid tool arguments: ${argValidation.error.issues
                  .map((i) => `${i.path.join('.')}: ${i.message}`)
                  .join('; ')}`
              };
            } else {
              try {
                const execRes = await registered.handler(
                  argValidation.data as Record<string, unknown>,
                  ctx
                );
                toolResult = execRes as unknown as Record<string, unknown>;
              } catch (err: any) {
                toolResult = {
                  success: false,
                  error: err?.message || String(err)
                };
              }
            }
          }

          const toolDuration = Date.now() - toolStart;
          totalActiveMs += toolDuration;

          await recordStep(ctx.runId, agentName, 'tool_result', {
            title: `Result from ${toolName}`,
            input: rawArgs,
            output: toolResult,
            durationMs: toolDuration
          });

          return {
            functionResponse: {
              name: toolName,
              response: toolResult
            }
          };
        })
      );

      contents.push({
        role: 'user',
        parts: responseParts
      });
    }

    // Final phase: a last turn with NO tools and responseMimeType: "application/json"
    contents.push({
      role: 'user',
      parts: [
        {
          text: 'Respond with ONLY a JSON object matching the required output schema. No markdown, no code fences.'
        }
      ]
    });

    const runFinalJsonTurn = async (): Promise<string> => {
      const cap = await acquireLLMCapacity();
      const callStart = Date.now();
      try {
        const finalResp = await withRetry(() =>
          ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
              systemInstruction,
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        );
        return stripMarkdownFences(String(finalResp?.text || ''));
      } catch (callErr) {
        cap.refundToken();
        throw callErr;
      } finally {
        totalActiveMs += Date.now() - callStart;
        cap.release();
      }
    };

    const rawJsonText = await runFinalJsonTurn();
    try {
      const parsedObj = JSON.parse(rawJsonText);
      const checked = schema.safeParse(parsedObj);
      if (checked.success) {
        return {
          data: checked.data,
          fallback: false,
          durationMs: totalActiveMs
        };
      }

      // Repair turn (retry once with validation error appended)
      contents.push({ role: 'model', parts: [{ text: rawJsonText }] });
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Your JSON did not match the schema. Validation errors: ${JSON.stringify(
              checked.error.issues
            )}. Respond with ONLY the corrected JSON object.`
          }
        ]
      });
    } catch (parseErr: any) {
      contents.push({ role: 'model', parts: [{ text: rawJsonText }] });
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Your response was not valid JSON (${parseErr.message}). Respond with ONLY a valid JSON object matching the schema.`
          }
        ]
      });
    }

    const repairedText = await runFinalJsonTurn();
    const repairedObj = JSON.parse(repairedText);
    const repairedCheck = schema.safeParse(repairedObj);
    if (!repairedCheck.success) {
      throw new AgentOutputError(
        `Agent "${agentName}" output failed schema validation after repair turn: ${repairedCheck.error.message}`
      );
    }

    return {
      data: repairedCheck.data,
      fallback: false,
      durationMs: totalActiveMs
    };
  } catch (err: any) {
    if (env.LLM_FALLBACK) {
      console.warn(`[Agent ${agentName}] Live turn failed (${err?.message || err}). Triggering fallback.`);
      const fbStart = Date.now();
      const data = await fallbackFn();
      return {
        data,
        fallback: true,
        durationMs: totalActiveMs + Math.max(20, Date.now() - fbStart),
        fallbackReason: err?.message || String(err)
      };
    }
    throw err;
  }
}
