import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from "vue";

export type EditSessionParticipant = {
  id: string;
  /** Higher priority participants flush first (e.g. canvas text/equation/crop before cell edit). */
  priority?: number;
  isActive: () => boolean;
  /** Returns false to synchronously veto the pending action (e.g. validation failure or IME composing). */
  flush: () => boolean;
  cancel?: () => void;
};

export type InteractionCoordinatorOptions<
  PaneId extends string = string,
  ClipboardOwner extends string = string,
> = {
  onPaneOpened?: (pane: PaneId) => void;
  onClipboardClaimed?: (owner: ClipboardOwner) => void;
};

export type InteractionCoordinator<
  PaneId extends string = string,
  ClipboardOwner extends string = string,
> = {
  registerEditParticipant: (participant: EditSessionParticipant) => () => void;
  flushActiveEdits: (exceptIds?: readonly string[]) => boolean;
  hasActiveEdit: (exceptIds?: readonly string[]) => boolean;
  cancelActiveEdits: (exceptIds?: readonly string[]) => void;
  registerPane: (id: PaneId, close: () => void) => () => void;
  notifyPaneOpened: (id: PaneId) => void;
  closeAllPanes: (exceptId?: PaneId) => void;
  activePane: Readonly<Ref<PaneId | null>>;
  registerClipboardOwner: (owner: ClipboardOwner, clear: () => void) => () => void;
  claimClipboard: (owner: ClipboardOwner) => void;
  activeClipboardOwner: Readonly<Ref<ClipboardOwner | null>>;
};

/**
 * Coordinates synchronous cross-subsystem invariants within a single workspace instance:
 * - Active edit flushing with synchronous boolean vetoing
 * - Mutually exclusive format/selection side panes
 * - Mutually exclusive internal clipboard owners (cell / picture / shape)
 */
export function createInteractionCoordinator<
  PaneId extends string = string,
  ClipboardOwner extends string = string,
>(
  options: InteractionCoordinatorOptions<PaneId, ClipboardOwner> = {},
): InteractionCoordinator<PaneId, ClipboardOwner> {
  const editParticipants = new Map<string, EditSessionParticipant>();
  const panes = new Map<PaneId, () => void>();
  const clipboardOwners = new Map<ClipboardOwner, () => void>();
  const activePane = ref<PaneId | null>(null) as Ref<PaneId | null>;
  const activeClipboardOwner = ref<ClipboardOwner | null>(null) as Ref<ClipboardOwner | null>;

  function orderedParticipants(exceptIds?: readonly string[]): EditSessionParticipant[] {
    const excluded = exceptIds?.length ? new Set(exceptIds) : undefined;
    return [...editParticipants.values()]
      .filter((participant) => !excluded?.has(participant.id))
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  }

  function registerEditParticipant(participant: EditSessionParticipant): () => void {
    editParticipants.set(participant.id, participant);
    const dispose = () => {
      if (editParticipants.get(participant.id) === participant) {
        editParticipants.delete(participant.id);
      }
    };
    if (getCurrentScope()) onScopeDispose(dispose);
    return dispose;
  }

  function flushActiveEdits(exceptIds?: readonly string[]): boolean {
    for (const participant of orderedParticipants(exceptIds)) {
      if (participant.isActive() && participant.flush() === false) {
        return false;
      }
    }
    return true;
  }

  function hasActiveEdit(exceptIds?: readonly string[]): boolean {
    return orderedParticipants(exceptIds).some((participant) => participant.isActive());
  }

  function cancelActiveEdits(exceptIds?: readonly string[]): void {
    for (const participant of orderedParticipants(exceptIds)) {
      if (participant.isActive()) participant.cancel?.();
    }
  }

  function registerPane(id: PaneId, close: () => void): () => void {
    panes.set(id, close);
    const dispose = () => {
      if (panes.get(id) === close) {
        panes.delete(id);
        if (activePane.value === id) activePane.value = null;
      }
    };
    if (getCurrentScope()) onScopeDispose(dispose);
    return dispose;
  }

  function closeAllPanes(exceptId?: PaneId): void {
    for (const [id, close] of Array.from(panes.entries())) {
      if (id !== exceptId) close();
    }
    if (!exceptId) activePane.value = null;
  }

  function notifyPaneOpened(id: PaneId): void {
    closeAllPanes(id);
    activePane.value = id;
    options.onPaneOpened?.(id);
  }

  function registerClipboardOwner(owner: ClipboardOwner, clear: () => void): () => void {
    clipboardOwners.set(owner, clear);
    const dispose = () => {
      if (clipboardOwners.get(owner) === clear) {
        clipboardOwners.delete(owner);
        if (activeClipboardOwner.value === owner) activeClipboardOwner.value = null;
      }
    };
    if (getCurrentScope()) onScopeDispose(dispose);
    return dispose;
  }

  function claimClipboard(owner: ClipboardOwner): void {
    for (const [candidate, clear] of Array.from(clipboardOwners.entries())) {
      if (candidate !== owner) clear();
    }
    activeClipboardOwner.value = owner;
    options.onClipboardClaimed?.(owner);
  }

  return {
    registerEditParticipant,
    flushActiveEdits,
    hasActiveEdit,
    cancelActiveEdits,
    registerPane,
    notifyPaneOpened,
    closeAllPanes,
    activePane: readonly(activePane) as Readonly<Ref<PaneId | null>>,
    registerClipboardOwner,
    claimClipboard,
    activeClipboardOwner: readonly(activeClipboardOwner) as Readonly<Ref<ClipboardOwner | null>>,
  };
}
