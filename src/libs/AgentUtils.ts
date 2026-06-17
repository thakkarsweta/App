import Onyx from 'react-native-onyx';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type AgentPrompt from '@src/types/onyx/AgentPrompt';
import type {Errors, PendingAction} from '@src/types/onyx/OnyxCommon';
import type PersonalDetails from '@src/types/onyx/PersonalDetails';
import type {AnyOnyxUpdate} from '@src/types/onyx/Request';

type AgentListItem = {
    accountID: number;
    displayName: string;
    login: string;
    pendingAction?: PendingAction | null;
    errors?: Errors | null;
    hasUpdateErrors: boolean;
};

function getAgentAccountIDFromCollectionKey(key: string): number | null {
    const prefix = ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT;
    if (!key.startsWith(prefix)) {
        return null;
    }

    const accountID = Number(key.slice(prefix.length));
    if (!Number.isFinite(accountID) || accountID <= 0) {
        return null;
    }

    return accountID;
}

function shouldPreferAgentListItem(candidate: AgentListItem, existing: AgentListItem, candidateDetails: PersonalDetails, existingDetails: PersonalDetails): boolean {
    if (candidateDetails.isOptimisticPersonalDetail !== existingDetails.isOptimisticPersonalDetail) {
        return !candidateDetails.isOptimisticPersonalDetail;
    }

    if ((candidate.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD) !== (existing.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD)) {
        return candidate.pendingAction !== CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD;
    }

    if (candidateDetails.isCustomAgent !== existingDetails.isCustomAgent) {
        return !!candidateDetails.isCustomAgent;
    }

    return candidate.accountID > existing.accountID;
}

function getAgentDeletionTombstoneAccountIDKey(accountID: number): string {
    return `accountID:${accountID}`;
}

function getAgentDeletionTombstoneLoginKey(login: string): string {
    return `login:${login}`;
}

function isAgentTombstoned(accountID: number, login: string | undefined, deletionTombstones: Record<string, boolean> | undefined): boolean {
    if (!deletionTombstones) {
        return false;
    }

    if (deletionTombstones[getAgentDeletionTombstoneAccountIDKey(accountID)]) {
        return true;
    }

    return !!login && deletionTombstones[getAgentDeletionTombstoneLoginKey(login)];
}

function buildAgentListItems(
    agentPrompts: Record<string, AgentPrompt | null> | undefined,
    personalDetailsList: Record<number, PersonalDetails> | undefined,
    deletionTombstones?: Record<string, boolean>,
): AgentListItem[] {
    const itemsByLogin = new Map<string, AgentListItem>();
    const itemsWithoutLogin: AgentListItem[] = [];
    const seenAccountIDs = new Set<number>();

    for (const [key, agentPrompt] of Object.entries(agentPrompts ?? {})) {
        if (!agentPrompt) {
            continue;
        }

        const accountID = getAgentAccountIDFromCollectionKey(key);
        if (!accountID || seenAccountIDs.has(accountID)) {
            continue;
        }

        const details = personalDetailsList?.[accountID];
        if (!details) {
            continue;
        }

        if (isAgentTombstoned(accountID, details.login, deletionTombstones)) {
            continue;
        }

        seenAccountIDs.add(accountID);

        const hasNameErrors = Object.keys(agentPrompt.nameErrors ?? {}).length > 0;
        const hasPromptErrors = Object.keys(agentPrompt.promptErrors ?? {}).length > 0;
        const hasAvatarErrors = Object.keys(agentPrompt.avatarErrors ?? {}).length > 0;
        const item: AgentListItem = {
            accountID,
            displayName: details.displayName ?? details.login ?? '',
            login: details.login ?? '',
            pendingAction: agentPrompt.pendingAction,
            errors: agentPrompt.errors,
            hasUpdateErrors: hasNameErrors || hasPromptErrors || hasAvatarErrors,
        };

        if (!item.login) {
            itemsWithoutLogin.push(item);
            continue;
        }

        const existing = itemsByLogin.get(item.login);
        if (!existing || shouldPreferAgentListItem(item, existing, details, personalDetailsList?.[existing.accountID] ?? details)) {
            itemsByLogin.set(item.login, item);
        }
    }

    return [...itemsByLogin.values(), ...itemsWithoutLogin];
}

let cachedDeletionTombstones: Record<string, boolean> | undefined;
let cachedAgentPrompts: Record<string, AgentPrompt | null> | undefined;
let cachedPersonalDetailsList: Record<number, PersonalDetails> | undefined;
let hasInitializedAgentDeletionGuard = false;

function getAgentDeletionTombstones(): Record<string, boolean> | undefined {
    return cachedDeletionTombstones;
}

function stripTombstonedAgentsFromOnyxUpdate(update: AnyOnyxUpdate, deletionTombstones: Record<string, boolean>): AnyOnyxUpdate {
    const promptPrefix = ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT;

    if (update.key?.startsWith(promptPrefix)) {
        const accountID = getAgentAccountIDFromCollectionKey(update.key);
        if (accountID && isAgentTombstoned(accountID, undefined, deletionTombstones)) {
            return {...update, onyxMethod: Onyx.METHOD.SET, value: null};
        }
        return update;
    }

    if (update.key === ONYXKEYS.PERSONAL_DETAILS_LIST && update.value && typeof update.value === 'object') {
        const value: Record<string, PersonalDetails | null> = {...update.value};
        let changed = false;

        for (const [idStr, details] of Object.entries(value)) {
            const accountID = Number(idStr);
            if (!Number.isFinite(accountID)) {
                continue;
            }

            const login = details?.login;
            if (isAgentTombstoned(accountID, login, deletionTombstones)) {
                value[idStr] = null;
                changed = true;
            }
        }

        return changed ? {...update, value} : update;
    }

    if (update.key === ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT && update.value && typeof update.value === 'object') {
        const value: Record<string, AgentPrompt | null> = {...update.value};
        let changed = false;

        for (const [memberID, agentPrompt] of Object.entries(value)) {
            const accountID = Number(memberID);
            if (!Number.isFinite(accountID) || !agentPrompt) {
                continue;
            }

            if (isAgentTombstoned(accountID, undefined, deletionTombstones)) {
                value[memberID] = null;
                changed = true;
            }
        }

        return changed ? {...update, value} : update;
    }

    return update;
}

function buildAgentDeletionTombstoneValue(accountID: number, agentLogin?: string): Record<string, boolean> {
    const tombstones: Record<string, boolean> = {
        [getAgentDeletionTombstoneAccountIDKey(accountID)]: true,
    };

    if (agentLogin) {
        tombstones[getAgentDeletionTombstoneLoginKey(agentLogin)] = true;
    }

    return tombstones;
}

function recordTombstonesForRemovedAgentPrompts(
    previousPrompts: Record<string, AgentPrompt | null> | undefined,
    currentPrompts: Record<string, AgentPrompt | null> | undefined,
    personalDetailsList: Record<number, PersonalDetails> | undefined,
) {
    if (!previousPrompts || !currentPrompts) {
        return;
    }

    for (const [key, previousPrompt] of Object.entries(previousPrompts)) {
        if (!previousPrompt || currentPrompts[key]) {
            continue;
        }

        const accountID = getAgentAccountIDFromCollectionKey(key);
        if (!accountID) {
            continue;
        }

        const login = personalDetailsList?.[accountID]?.login;
        Onyx.merge(ONYXKEYS.AGENT_DELETION_TOMBSTONES, buildAgentDeletionTombstoneValue(accountID, login));
    }
}

function recordTombstonesForRemovedCustomAgents(
    previousPersonalDetailsList: Record<number, PersonalDetails> | undefined,
    currentPersonalDetailsList: Record<number, PersonalDetails> | undefined,
) {
    if (!previousPersonalDetailsList || !currentPersonalDetailsList) {
        return;
    }

    for (const [accountIDStr, previousDetails] of Object.entries(previousPersonalDetailsList)) {
        if (!previousDetails?.isCustomAgent) {
            continue;
        }

        const accountID = Number(accountIDStr);
        if (!Number.isFinite(accountID)) {
            continue;
        }

        const currentDetails = currentPersonalDetailsList[accountID];
        if (currentDetails?.isCustomAgent) {
            continue;
        }

        Onyx.merge(ONYXKEYS.AGENT_DELETION_TOMBSTONES, buildAgentDeletionTombstoneValue(accountID, previousDetails.login));
    }
}

function recordAgentDeletionsFromOnyxUpdates(updates: AnyOnyxUpdate[]) {
    const promptPrefix = ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT;

    for (const update of updates) {
        if (update.key?.startsWith(promptPrefix) && update.value === null) {
            const accountID = getAgentAccountIDFromCollectionKey(update.key);
            if (!accountID) {
                continue;
            }

            const login = cachedPersonalDetailsList?.[accountID]?.login;
            Onyx.merge(ONYXKEYS.AGENT_DELETION_TOMBSTONES, buildAgentDeletionTombstoneValue(accountID, login));
            continue;
        }

        if (update.key === ONYXKEYS.PERSONAL_DETAILS_LIST && update.value && typeof update.value === 'object') {
            for (const [accountIDStr, details] of Object.entries(update.value as Record<string, PersonalDetails | null>)) {
                const accountID = Number(accountIDStr);
                if (!Number.isFinite(accountID) || details !== null) {
                    continue;
                }

                const previousDetails = cachedPersonalDetailsList?.[accountID];
                if (!previousDetails?.isCustomAgent) {
                    continue;
                }

                Onyx.merge(ONYXKEYS.AGENT_DELETION_TOMBSTONES, buildAgentDeletionTombstoneValue(accountID, previousDetails.login));
            }
            continue;
        }

        if (update.key === ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT && update.value && typeof update.value === 'object') {
            for (const [memberID, agentPrompt] of Object.entries(update.value as Record<string, AgentPrompt | null>)) {
                if (agentPrompt !== null) {
                    continue;
                }

                const accountID = Number(memberID);
                if (!Number.isFinite(accountID)) {
                    continue;
                }

                const login = cachedPersonalDetailsList?.[accountID]?.login;
                Onyx.merge(ONYXKEYS.AGENT_DELETION_TOMBSTONES, buildAgentDeletionTombstoneValue(accountID, login));
            }
        }
    }
}

function stripTombstonedAgentsFromOnyxUpdates(updates: AnyOnyxUpdate[], deletionTombstones: Record<string, boolean> | undefined): AnyOnyxUpdate[] {
    if (!deletionTombstones || Object.keys(deletionTombstones).length === 0) {
        return updates;
    }

    return updates.map((update) => stripTombstonedAgentsFromOnyxUpdate(update, deletionTombstones));
}

function purgeResurrectedDeletedAgents(
    agentPrompts: Record<string, AgentPrompt | null> | undefined,
    personalDetailsList: Record<number, PersonalDetails> | undefined,
    deletionTombstones: Record<string, boolean> | undefined,
) {
    if (!deletionTombstones) {
        return;
    }

    for (const tombstoneKey of Object.keys(deletionTombstones)) {
        if (!tombstoneKey.startsWith('accountID:')) {
            continue;
        }

        const accountID = Number(tombstoneKey.slice('accountID:'.length));
        if (!Number.isFinite(accountID) || accountID <= 0) {
            continue;
        }

        const promptKey = `${ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT}${accountID}`;
        if (agentPrompts?.[promptKey] || personalDetailsList?.[accountID]) {
            Onyx.set(promptKey, null);
            Onyx.merge(ONYXKEYS.PERSONAL_DETAILS_LIST, {[accountID]: null});
        }
    }

    for (const tombstoneKey of Object.keys(deletionTombstones)) {
        if (!tombstoneKey.startsWith('login:')) {
            continue;
        }

        const login = tombstoneKey.slice('login:'.length);
        if (!login || !personalDetailsList) {
            continue;
        }

        for (const [accountIDStr, details] of Object.entries(personalDetailsList)) {
            const accountID = Number(accountIDStr);
            if (!Number.isFinite(accountID) || details?.login !== login) {
                continue;
            }

            const promptKey = `${ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT}${accountID}`;
            if (agentPrompts?.[promptKey] || details) {
                Onyx.set(promptKey, null);
                Onyx.merge(ONYXKEYS.PERSONAL_DETAILS_LIST, {[accountID]: null});
            }
        }
    }
}

function runAgentDeletionPurgeIfNeeded() {
    purgeResurrectedDeletedAgents(cachedAgentPrompts, cachedPersonalDetailsList, cachedDeletionTombstones);
}

function initAgentDeletionGuard() {
    if (hasInitializedAgentDeletionGuard) {
        return;
    }

    hasInitializedAgentDeletionGuard = true;

    Onyx.connectWithoutView({
        key: ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT,
        waitForCollectionCallback: true,
        callback: (value) => {
            recordTombstonesForRemovedAgentPrompts(cachedAgentPrompts, value, cachedPersonalDetailsList);
            cachedAgentPrompts = value;
            runAgentDeletionPurgeIfNeeded();
        },
    });

    Onyx.connectWithoutView({
        key: ONYXKEYS.PERSONAL_DETAILS_LIST,
        callback: (value) => {
            recordTombstonesForRemovedCustomAgents(cachedPersonalDetailsList, value);
            cachedPersonalDetailsList = value;
            runAgentDeletionPurgeIfNeeded();
        },
    });

    Onyx.connectWithoutView({
        key: ONYXKEYS.AGENT_DELETION_TOMBSTONES,
        callback: (value) => {
            cachedDeletionTombstones = value;
            runAgentDeletionPurgeIfNeeded();
        },
    });
}

export {
    getAgentAccountIDFromCollectionKey,
    getAgentDeletionTombstoneAccountIDKey,
    getAgentDeletionTombstoneLoginKey,
    getAgentDeletionTombstones,
    initAgentDeletionGuard,
    isAgentTombstoned,
    purgeResurrectedDeletedAgents,
    recordAgentDeletionsFromOnyxUpdates,
    stripTombstonedAgentsFromOnyxUpdates,
    buildAgentListItems,
};
export type {AgentListItem};
