import protocol from '../../functions/protocol-v1.json' with { type: 'json' };
import { bounded, checkAbort, CloudError } from './errors.mjs';

// One server-owned Free candidate; no client model choice, gateway, paid fallback or key.
export const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const OUTPUT_TOKENS = 1200;
export const INPUT_BYTES = 30_000;
const encoder = new TextEncoder();
const system = protocol.system + '\nReturn only JSON matching this protocol schema:\n' + JSON.stringify(protocol.schema);

export function buildProviderInput(prompt) {
  // Conservative UTF-8 byte budget leaves space in the documented 32K context.
  // Reject oversize context; never silently drop records or change their IDs.
  if (encoder.encode(system).length + encoder.encode(prompt).length > INPUT_BYTES)
    throw new CloudError(400, 'context-too-large');
  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    response_format: { type: 'json_object' }, stream: false, max_tokens: OUTPUT_TOKENS, temperature: 0.1,
  };
}

export function parseProviderOutput(raw, requestId) {
  // Qwen's current documented envelope is chat.completion, not Gemini candidates.
  if (!raw || raw.object !== 'chat.completion' || !Array.isArray(raw.choices) || raw.choices.length !== 1)
    throw new CloudError(502, 'invalid-provider-response');
  const choice = raw.choices[0];
  if (choice.finish_reason !== 'stop') throw new CloudError(502, 'incomplete-provider-response');
  const content = choice.message?.content;
  if (choice.message?.role !== 'assistant' || choice.message?.tool_calls?.length ||
      typeof content !== 'string' || encoder.encode(content).length > 64_000)
    throw new CloudError(502, 'invalid-provider-response');
  let decision;
  try { decision = JSON.parse(content); } catch { throw new CloudError(502, 'invalid-provider-response'); }
  if (!decision || Array.isArray(decision) || decision.version !== protocol.version || decision.requestId !== requestId ||
      !['actions', 'clarify', 'escalate'].includes(decision.route)) throw new CloudError(502, 'invalid-provider-response');
  // Full field/reference/grounding validation remains mandatory in the app Mini parser.
  return decision;
}

export async function runQwen({ ai, input, requestId, signal, now = Date.now }) {
  try {
    const raw = await bounded(signal, () => ai.run(MODEL, input));
    checkAbort(signal);
    return parseProviderOutput(raw, requestId);
  } catch (error) {
    checkAbort(signal);
    if (error instanceof CloudError) throw error;
    // Documented Workers AI internal codes; never expose provider diagnostics.
    const code = Number(error?.code);
    if (code === 3036) {
      const at = now();
      throw new CloudError(429, 'daily-limit', Math.max(1, Math.ceil((86_400_000 - at % 86_400_000) / 1000)));
    }
    if (code === 3040 || Number(error?.status) === 429) throw new CloudError(429, 'provider-busy', 60);
    if (code === 5035) throw new CloudError(503, 'cloud-not-configured');
    throw new CloudError(502, 'provider-unavailable');
  }
}
