import type { LocalAiModelDefinition } from './local-ai/model-catalog';

export type AssistantOfflineStatus = 'ready' | 'not-released' | 'not-installed' | 'runtime-unavailable';

export function assistantOfflineStatus(input: {
  definition?: LocalAiModelDefinition | null;
  installed: boolean;
  runtimeAvailable: boolean;
}): AssistantOfflineStatus {
  if (!input.definition?.artifact) return 'not-released';
  if (!input.installed) return 'not-installed';
  return input.runtimeAvailable ? 'ready' : 'runtime-unavailable';
}

export function assistantUnavailableReply(status?: AssistantOfflineStatus) {
  const reason = status === 'not-released'
    ? 'Your selected Qwen model has no released phone version yet. Changing between Lite and Enhanced will not enable it.'
    : status === 'not-installed'
      ? 'The selected offline model file is not installed. Check AI models for its installation requirements.'
      : status === 'runtime-unavailable'
        ? 'The selected model cannot run in this installed app. Check its compatibility in AI models.'
        : 'The offline model could not produce a valid action for this request. Nothing was changed.';
  return `${reason} I can still help with supported task requests and app guidance. Try “I have to complete bio practical nb by tomorrow” or ask “What can you do?”`;
}

// These are bounded app-help replies, not model-generated conversation or tutoring.
// Match the complete message so a greeting/help phrase cannot swallow an action.
export function tryAssistantChatReply(request: string, status: AssistantOfflineStatus): string | null {
  const text = request.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  if (/^(?:hi|hello|hey|hi myelin|hello myelin)$/.test(text)) {
    return 'Hi! Tell me what you need to get done. I can prepare supported tasks and ask for missing details. You review changes before I add anything.';
  }
  if (/^(?:thanks|thank you|thank you myelin|ok thanks|okay thanks)$/.test(text)) return 'You’re welcome. What would you like to work on next?';
  if (/^(?:help|help me|what can you do|what can you help with|how do i use (?:you|this assistant))$/.test(text)) {
    return 'I can prepare homework, notebooks, projects and practice tasks, or record weekly school, tuition and coaching hours. I’ll ask for missing details, then show a preview to confirm.\n\nTry “School weekdays from 5:30 AM to 2 PM” or “Add Trigonometry practice tomorrow for 30 minutes.” You can also ask how to use Today, Focus, Review or Progress.\n\nGeneral chat and subject explanations still need a connected teaching model; cloud AI is not connected in this beta.';
  }
  if (/^(?:are you (?:working|available|ready)|why (?:are you|is the ai) (?:weak|not working)|(?:what|which) model (?:are you using|is running)|is (?:qwen|cloud ai) (?:working|connected|available))$/.test(text)) {
    return status === 'ready'
      ? 'An offline action model is available. It proposes supported app changes; it is not a general chat or teaching model. Cloud AI is not connected in this beta.'
      : `${assistantUnavailableReply(status)} Cloud AI is not connected in this beta.`;
  }
  const help = /^(?:how (?:do i|to) (?:use|open)|what is) (today|focus|review|progress)(?: (?:screen|tab))?$/.exec(text);
  if (help) {
    const replies: Record<string, string> = {
      today: 'Today is your starting point. Review the next suggested work, choose a task and start a Focus session. You can schedule unscheduled work for a day that suits you.',
      focus: 'Choose work from Today and start a Focus session. Study during the session, then record what you completed so MYELIN can adapt your next steps.',
      review: 'Open Review to revisit topics that are due. Try to recall before checking, then grade your recall so MYELIN can adjust the next review.',
      progress: 'Open Progress to see your study activity and patterns. Your recorded sessions and recall feedback help MYELIN personalize its suggestions.',
    };
    return replies[help[1]!]!;
  }
  return null;
}

export type AssistantChatScope = { ownerKey: string | null; revision: number; epoch: number };
export type AssistantChatMessage = { id: number; role: 'user' | 'assistant'; text: string };
export type AssistantChatState = AssistantChatScope & { nextId: number; messages: AssistantChatMessage[] };
export type AssistantChatEvent =
  | { type: 'sync'; ownerKey: string | null; revision: number }
  | { type: 'reset' }
  | { type: 'append'; scope: AssistantChatScope; role: AssistantChatMessage['role']; text: string }
  | { type: 'committed'; scope: AssistantChatScope; text: string };

export function createAssistantChat(ownerKey: string | null, revision: number): AssistantChatState {
  return { ownerKey, revision, epoch: 0, nextId: 1, messages: [] };
}

export function assistantChatReducer(state: AssistantChatState, event: AssistantChatEvent): AssistantChatState {
  if (event.type === 'reset') return { ...state, epoch: state.epoch + 1, messages: [], nextId: 1 };
  if (event.type === 'sync') {
    if (event.ownerKey === state.ownerKey && event.revision === state.revision) return state;
    return { ...state, ownerKey: event.ownerKey, revision: event.revision,
      epoch: state.epoch + (event.ownerKey === state.ownerKey ? 0 : 1),
      messages: event.ownerKey === state.ownerKey ? state.messages : [] };
  }
  const matchingRevision = event.scope.revision === state.revision ||
    (event.type === 'committed' && event.scope.revision + 1 === state.revision);
  if (event.scope.ownerKey !== state.ownerKey || !matchingRevision || event.scope.epoch !== state.epoch) return state;
  const text = event.text.trim();
  if (!text) return state;
  // Screen-local history is bounded and is never fed back as executable model context.
  return { ...state, nextId: state.nextId + 1, messages: [...state.messages,
    { id: state.nextId, role: event.type === 'committed' ? 'assistant' : event.role, text: text.slice(0, 4000) }].slice(-80) };
}
