import Onyx from 'react-native-onyx';
import {
    buildAgentListItems,
    getAgentAccountIDFromCollectionKey,
    getAgentDeletionTombstoneAccountIDKey,
    getAgentDeletionTombstoneLoginKey,
    recordAgentDeletionsFromOnyxUpdates,
    stripTombstonedAgentsFromOnyxUpdates,
} from '@libs/AgentUtils';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

describe('AgentUtils', () => {
    const prefix = ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT;

    describe('getAgentAccountIDFromCollectionKey', () => {
        it('parses accountID from a collection key', () => {
            expect(getAgentAccountIDFromCollectionKey(`${prefix}12345`)).toBe(12345);
        });

        it('returns null for invalid keys', () => {
            expect(getAgentAccountIDFromCollectionKey('invalid_key')).toBeNull();
            expect(getAgentAccountIDFromCollectionKey(`${prefix}0`)).toBeNull();
        });
    });

    describe('buildAgentListItems', () => {
        it('deduplicates agents that share the same login and prefers the confirmed server entry', () => {
            const optimisticAccountID = 111;
            const realAccountID = 222;
            const login = 'agent_123@expensify.ai';

            const items = buildAgentListItems(
                {
                    [`${prefix}${optimisticAccountID}`]: {prompt: 'Optimistic prompt', pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
                    [`${prefix}${realAccountID}`]: {prompt: 'Real prompt'},
                },
                {
                    [optimisticAccountID]: {
                        accountID: optimisticAccountID,
                        displayName: 'Optimistic Agent',
                        login,
                        isOptimisticPersonalDetail: true,
                    },
                    [realAccountID]: {
                        accountID: realAccountID,
                        displayName: 'Real Agent',
                        login,
                        isCustomAgent: true,
                    },
                },
            );

            expect(items).toHaveLength(1);
            expect(items.at(0)?.accountID).toBe(realAccountID);
            expect(items.at(0)?.displayName).toBe('Real Agent');
        });

        it('skips null prompt entries and entries without personal details', () => {
            const accountID = 12345;
            const items = buildAgentListItems(
                {
                    [`${prefix}${accountID}`]: null,
                    [`${prefix}99999`]: {prompt: 'Orphan prompt'},
                },
                {
                    [accountID]: {
                        accountID,
                        displayName: 'Only valid agent',
                        login: 'agent_999@expensify.ai',
                    },
                },
            );

            expect(items).toHaveLength(0);
        });

        it('keeps in-flight optimistic agents without a login', () => {
            const optimisticAccountID = 333;
            const items = buildAgentListItems(
                {
                    [`${prefix}${optimisticAccountID}`]: {prompt: 'Pending prompt', pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
                },
                {
                    [optimisticAccountID]: {
                        accountID: optimisticAccountID,
                        displayName: 'Pending Agent',
                        isOptimisticPersonalDetail: true,
                    },
                },
            );

            expect(items).toHaveLength(1);
            expect(items.at(0)?.accountID).toBe(optimisticAccountID);
            expect(items.at(0)?.login).toBe('');
        });

        it('hides tombstoned agents even if OpenAgentsPage merges them back into Onyx', () => {
            const accountID = 444;
            const login = 'agent_deleted@expensify.ai';
            const items = buildAgentListItems(
                {
                    [`${prefix}${accountID}`]: {prompt: 'Should be hidden'},
                },
                {
                    [accountID]: {
                        accountID,
                        displayName: 'Deleted Agent',
                        login,
                        isCustomAgent: true,
                    },
                },
                {
                    [getAgentDeletionTombstoneAccountIDKey(accountID)]: true,
                    [getAgentDeletionTombstoneLoginKey(login)]: true,
                },
            );

            expect(items).toHaveLength(0);
        });
    });

    describe('stripTombstonedAgentsFromOnyxUpdates', () => {
        it('nulls tombstoned agent prompt and personal detail updates from API responses', () => {
            const accountID = 555;
            const login = 'agent_hidden@expensify.ai';
            const tombstones = {
                [getAgentDeletionTombstoneAccountIDKey(accountID)]: true,
                [getAgentDeletionTombstoneLoginKey(login)]: true,
            };

            const updates = stripTombstonedAgentsFromOnyxUpdates(
                [
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: `${prefix}${accountID}`,
                        value: {prompt: 'Resurrected prompt'},
                    },
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: ONYXKEYS.PERSONAL_DETAILS_LIST,
                        value: {
                            [accountID]: {
                                accountID,
                                displayName: 'Resurrected Agent',
                                login,
                                isCustomAgent: true,
                            },
                        },
                    },
                ],
                tombstones,
            );

            expect(updates.at(0)?.onyxMethod).toBe(Onyx.METHOD.SET);
            expect(updates.at(0)?.value).toBeNull();
            expect((updates.at(1)?.value as Record<string, unknown>)[accountID]).toBeNull();
        });

        it('records tombstones when Pusher deletes an agent prompt', () => {
            const accountID = 666;
            const login = 'agent_pusher@expensify.ai';
            const mergeSpy = jest.spyOn(Onyx, 'merge').mockResolvedValue(undefined);

            recordAgentDeletionsFromOnyxUpdates([
                {
                    onyxMethod: Onyx.METHOD.SET,
                    key: `${prefix}${accountID}`,
                    value: null,
                },
            ]);

            expect(mergeSpy).toHaveBeenCalledWith(ONYXKEYS.AGENT_DELETION_TOMBSTONES, {
                [getAgentDeletionTombstoneAccountIDKey(accountID)]: true,
            });

            mergeSpy.mockRestore();
        });
    });
});
