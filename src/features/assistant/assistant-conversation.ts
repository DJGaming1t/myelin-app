export type AssistantChatScope = {
  ownerKey: string | null;
  revision: number;
  epoch: number;
};

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
};

export type AssistantChatState = {
  ownerKey: string | null;
  revision: number;
  epoch: number;
  messages: AssistantChatMessage[];
};

export type AssistantChatAction =
  | {
      type: 'append';
      scope: AssistantChatScope;
      role: 'user' | 'assistant';
      text: string;
    }
  | {
      type: 'committed';
      scope: AssistantChatScope;
      text: string;
    }
  | {
      type: 'sync';
      ownerKey: string | null;
      revision: number;
    }
  | {
      type: 'reset';
    };

export function createAssistantChat(
  ownerKey: string | null,
  revision: number,
): AssistantChatState {
  return {
    ownerKey,
    revision,
    epoch: 1,
    messages: [],
  };
}

export function assistantChatReducer(
  state: AssistantChatState,
  action: AssistantChatAction,
): AssistantChatState {
  if (action.type === 'reset') {
    return {
      ...state,
      epoch: state.epoch + 1,
      messages: [],
    };
  }
  if (action.type === 'sync') {
    if (state.ownerKey !== action.ownerKey) {
      return {
        ownerKey: action.ownerKey,
        revision: action.revision,
        epoch: state.epoch + 1,
        messages: [],
      };
    }
    return {
      ...state,
      revision: action.revision,
    };
  }
  if (action.type === 'append' || action.type === 'committed') {
    if (action.scope.ownerKey !== state.ownerKey || action.scope.epoch !== state.epoch) {
      return state;
    }
    const msg: AssistantChatMessage = {
      id: `msg_${Date.now().toString(36)}_${ state.messages.length + 1 }`,
      role: action.type === 'committed' ? 'assistant' : action.role,
      text: action.text,
      createdAt: Date.now(),
    };
    return {
      ...state,
      messages: [...state.messages, msg],
    };
  }
  return state;
}

export function assistantOfflineStatus({
  definition,
  installed,
  runtimeAvailable,
}: {
  definition?: { id: string } | null;
  installed: boolean;
  runtimeAvailable: boolean;
}): 'ready' | 'not-installed' | 'runtime-unavailable' {
  if (!definition || !installed) return 'not-installed';
  if (!runtimeAvailable) return 'runtime-unavailable';
  return 'ready';
}

export function tryAssistantChatReply(
  text: string,
  _offlineStatus: 'ready' | 'not-installed' | 'runtime-unavailable',
): string | null {
  const lower = text.trim().toLowerCase();
  if (lower === 'what can you do?' || lower === 'help') {
    return 'I can preview study tasks, recurring commitments, exam plans, and read-only workflow checks. Try “Review my plan”, “What should I start next?”, or “Analyse my current workflow”.';
  }
  return null;
}
