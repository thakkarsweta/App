import React, {useEffect, useMemo, useRef, useState} from 'react';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import {useSearchQueryContext, useSearchResultsContext, useSearchSelectionActions, useSearchSelectionContext} from './SearchContext';
import {SearchSelectionActionsContext, SearchSelectionContext} from './SearchContextDefinitions';
import {deriveSelectedReports} from './selectionBuilders';
import type {SearchData, SearchSelectionActionsValue, SearchSelectionContextValue, SelectedReports, SelectedTransactions} from './types';

type SearchSelectionProviderProps = {
    children: React.ReactNode;
};

type SelectionState = {
    selectedTransactions: SelectedTransactions;
    selectedTransactionIDs: string[];
    selectedReports: SelectedReports[];
    currentSelectedTransactionReportID: string | undefined;
    shouldTurnOffSelectionMode: boolean;
    areAllMatchingItemsSelected: boolean;
    excludedTransactionsFromSelectAll: Record<string, true>;
    selectAllMatchingSnapshotCount: number | undefined;
    selectAllMatchingVisibleSnapshotCount: number | undefined;
};

function getValidSearchCount(count: number | null | undefined): number | undefined {
    return typeof count === 'number' && count > 0 ? count : undefined;
}

function getServerTotalForSelectAll(selectAllMatchingSnapshotCount: number | undefined, liveSearchCount: number | null | undefined): number | undefined {
    const snapshotTotal = getValidSearchCount(selectAllMatchingSnapshotCount);
    const liveTotal = getValidSearchCount(liveSearchCount);

    if (snapshotTotal != null && liveTotal != null) {
        return Math.max(snapshotTotal, liveTotal);
    }

    return snapshotTotal ?? liveTotal;
}

function getSelectAllMatchingDisplayCount(
    excludedTransactionsFromSelectAll: Record<string, true>,
    selectAllMatchingSnapshotCount: number | undefined,
    selectAllMatchingVisibleSnapshotCount: number | undefined,
    liveSearchCount: number | null | undefined,
    hasMoreResults: boolean | undefined,
): number {
    const excludedCount = Object.keys(excludedTransactionsFromSelectAll).length;
    const serverTotal = getServerTotalForSelectAll(selectAllMatchingSnapshotCount, liveSearchCount);

    if (serverTotal != null) {
        return Math.max(0, serverTotal - excludedCount);
    }

    // Only fall back to the visible page count when every matching item is on screen. With more pages, that
    // under-counts (e.g. 50 visible − 3 excluded = 47 while the real total is 57 − 3 = 54).
    if (!hasMoreResults && typeof selectAllMatchingVisibleSnapshotCount === 'number' && selectAllMatchingVisibleSnapshotCount > 0) {
        return Math.max(0, selectAllMatchingVisibleSnapshotCount - excludedCount);
    }

    return 0;
}

const defaultSelectionState: SelectionState = {
    selectedTransactions: {},
    selectedTransactionIDs: [],
    selectedReports: [],
    currentSelectedTransactionReportID: undefined,
    shouldTurnOffSelectionMode: false,
    areAllMatchingItemsSelected: false,
    excludedTransactionsFromSelectAll: {},
    selectAllMatchingSnapshotCount: undefined,
    selectAllMatchingVisibleSnapshotCount: undefined,
};

// Owns selection state + pure setters only; the write actions (toggle/toggleAll) live in SearchWriteActionsProvider.
function SearchSelectionProvider({children}: SearchSelectionProviderProps) {
    const {currentSearchHash} = useSearchQueryContext();
    const {currentSearchResults} = useSearchResultsContext();

    const areTransactionsEmpty = useRef(true);
    const [selectionState, setSelectionState] = useState<SelectionState>(defaultSelectionState);

    const currentSearchHashRef = useRef(currentSearchHash);
    useEffect(() => {
        currentSearchHashRef.current = currentSearchHash;
    }, [currentSearchHash]);

    // Backfill the server total when search metadata arrives after "select all matching" was enabled.
    useEffect(() => {
        const liveCount = getValidSearchCount(currentSearchResults?.search?.count);
        if (!liveCount) {
            return;
        }

        setSelectionState((prevState) => {
            if (!prevState.areAllMatchingItemsSelected) {
                return prevState;
            }

            const prevSnapshotCount = getValidSearchCount(prevState.selectAllMatchingSnapshotCount);
            if (prevSnapshotCount != null && prevSnapshotCount >= liveCount) {
                return prevState;
            }

            return {
                ...prevState,
                selectAllMatchingSnapshotCount: liveCount,
            };
        });
    }, [currentSearchResults?.search?.count]);

    const setSelectedTransactions: SearchSelectionActionsValue['setSelectedTransactions'] = (transactionIDs, data) => {
        if (transactionIDs instanceof Array) {
            if (!transactionIDs.length && areTransactionsEmpty.current) {
                areTransactionsEmpty.current = true;
                return;
            }
            areTransactionsEmpty.current = false;
            setSelectionState((prevState) => ({
                ...prevState,
                selectedTransactionIDs: transactionIDs,
            }));
            return;
        }

        // When the caller provides `data`, derive `selectedReports` in the same commit so the
        // two state slices can't diverge for a render.
        if (data) {
            setSelectionState((prevState) => ({
                ...prevState,
                selectedTransactions: transactionIDs,
                selectedReports: deriveSelectedReports(transactionIDs, data),
                shouldTurnOffSelectionMode: false,
            }));
            return;
        }

        setSelectionState((prevState) => ({
            ...prevState,
            selectedTransactions: transactionIDs,
            shouldTurnOffSelectionMode: false,
        }));
    };

    // Read-modify-write the selection atomically. The updater receives the previous map so write actions never
    // need to close over (and re-render on) selection state. `totalSelectableItemsCount` unchecks select-all when
    // the new selection no longer covers every item; omitting it (e.g. during data reconcile) leaves select-all
    // untouched, which is what the former `isRefreshingSelection` flag protected.
    const applySelection: SearchSelectionActionsValue['applySelection'] = (updater, options) => {
        setSelectionState((prevState) => {
            if (options?.resetSelectAllMatching) {
                return {
                    ...prevState,
                    selectedTransactions: {},
                    selectedReports: options?.data ? deriveSelectedReports({}, options.data) : [],
                    areAllMatchingItemsSelected: false,
                    excludedTransactionsFromSelectAll: {},
                    selectAllMatchingSnapshotCount: undefined,
                    selectAllMatchingVisibleSnapshotCount: undefined,
                    shouldTurnOffSelectionMode: false,
                };
            }

            const selectedTransactions = updater(prevState.selectedTransactions);
            const toggleExcludedKey = options?.toggleExcludedFromSelectAll;
            let excludedTransactionsFromSelectAll = prevState.excludedTransactionsFromSelectAll;

            if (toggleExcludedKey) {
                if (excludedTransactionsFromSelectAll[toggleExcludedKey]) {
                    const {[toggleExcludedKey]: omittedKey, ...remainingExcluded} = excludedTransactionsFromSelectAll;
                    excludedTransactionsFromSelectAll = remainingExcluded;
                } else {
                    excludedTransactionsFromSelectAll = {...excludedTransactionsFromSelectAll, [toggleExcludedKey]: true};
                }
            }

            if (selectedTransactions === prevState.selectedTransactions && !toggleExcludedKey) {
                return prevState;
            }

            const totalSelectableItemsCount = options?.totalSelectableItemsCount;
            const areAllMatchingItemsSelected = toggleExcludedKey
                ? prevState.areAllMatchingItemsSelected
                : totalSelectableItemsCount && totalSelectableItemsCount !== Object.keys(selectedTransactions).length
                  ? false
                  : prevState.areAllMatchingItemsSelected;

            return {
                ...prevState,
                selectedTransactions,
                areAllMatchingItemsSelected,
                excludedTransactionsFromSelectAll,
                selectedReports: options?.data ? deriveSelectedReports(selectedTransactions, options.data) : prevState.selectedReports,
                shouldTurnOffSelectionMode: false,
            };
        });
    };

    const setSelectedReports: SearchSelectionActionsValue['setSelectedReports'] = (reports) => {
        setSelectionState((prevState) => {
            if (prevState.selectedReports.length === 0 && reports.length === 0) {
                return prevState;
            }
            return {
                ...prevState,
                selectedReports: reports,
            };
        });
    };

    const setCurrentSelectedTransactionReportID: SearchSelectionActionsValue['setCurrentSelectedTransactionReportID'] = (reportID) => {
        setSelectionState((prevState) => {
            if (reportID === prevState.currentSelectedTransactionReportID) {
                return prevState;
            }
            return {
                ...prevState,
                currentSelectedTransactionReportID: reportID,
            };
        });
    };

    const selectAllMatchingItems: SearchSelectionActionsValue['selectAllMatchingItems'] = (shouldSelectAll, options) => {
        setSelectionState((prevState) => {
            if (prevState.areAllMatchingItemsSelected === shouldSelectAll && isEmptyObject(prevState.excludedTransactionsFromSelectAll)) {
                return prevState;
            }

            const snapshotCount = shouldSelectAll ? getValidSearchCount(options?.totalCount ?? currentSearchResults?.search?.count) : undefined;
            const visibleSnapshotCount = shouldSelectAll ? options?.visibleSelectableCount : undefined;

            return {
                ...prevState,
                areAllMatchingItemsSelected: shouldSelectAll,
                excludedTransactionsFromSelectAll: {},
                selectAllMatchingSnapshotCount: snapshotCount,
                selectAllMatchingVisibleSnapshotCount: visibleSnapshotCount,
                ...(shouldSelectAll ? {selectedTransactions: {}, selectedReports: []} : {selectAllMatchingVisibleSnapshotCount: undefined}),
            };
        });
    };

    const clearSelectedTransactions: SearchSelectionActionsValue['clearSelectedTransactions'] = (searchHashOrClearIDsFlag, shouldTurnOffSelectionMode = false) => {
        if (typeof searchHashOrClearIDsFlag === 'boolean') {
            setSelectedTransactions([]);
            return;
        }

        if (searchHashOrClearIDsFlag === currentSearchHashRef.current) {
            return;
        }

        setSelectionState((prevState) => {
            if (prevState.selectedReports.length === 0 && isEmptyObject(prevState.selectedTransactions) && !prevState.shouldTurnOffSelectionMode && !prevState.areAllMatchingItemsSelected) {
                return prevState;
            }
            return {
                ...prevState,
                shouldTurnOffSelectionMode,
                selectedTransactions: {},
                selectedReports: [],
                areAllMatchingItemsSelected: false,
                excludedTransactionsFromSelectAll: {},
                selectAllMatchingSnapshotCount: undefined,
                selectAllMatchingVisibleSnapshotCount: undefined,
            };
        });
    };

    const removeTransaction: SearchSelectionActionsValue['removeTransaction'] = (transactionID) => {
        if (!transactionID) {
            return;
        }

        setSelectionState((prevState) => {
            const hasSelectedTransactions = !isEmptyObject(prevState.selectedTransactions);
            const hasSelectedIDs = prevState.selectedTransactionIDs.length > 0;

            if (!hasSelectedTransactions && !hasSelectedIDs) {
                return prevState;
            }

            const newState = {...prevState};
            if (hasSelectedTransactions) {
                const newSelectedTransactions = Object.entries(prevState.selectedTransactions).reduce((acc, [key, value]) => {
                    if (key === transactionID) {
                        return acc;
                    }
                    acc[key] = value;
                    return acc;
                }, {} as SelectedTransactions);
                newState.selectedTransactions = newSelectedTransactions;
            }
            if (hasSelectedIDs) {
                newState.selectedTransactionIDs = prevState.selectedTransactionIDs.filter((ID) => transactionID !== ID);
            }
            return newState;
        });
    };

    const hasSelectedTransactions =
        selectionState.areAllMatchingItemsSelected || selectionState.selectedTransactionIDs.length > 0 || Object.values(selectionState.selectedTransactions).some((t) => t.isSelected);

    const selectionDisplayCount = useMemo(() => {
        if (selectionState.areAllMatchingItemsSelected) {
            return getSelectAllMatchingDisplayCount(
                selectionState.excludedTransactionsFromSelectAll,
                selectionState.selectAllMatchingSnapshotCount,
                selectionState.selectAllMatchingVisibleSnapshotCount,
                currentSearchResults?.search?.count,
            );
        }

        return Object.values(selectionState.selectedTransactions).filter((transaction) => transaction?.isSelected).length;
    }, [selectionState, currentSearchResults?.search?.count]);

    const {selectAllMatchingSnapshotCount, selectAllMatchingVisibleSnapshotCount, ...publicSelectionState} = selectionState;
    void selectAllMatchingSnapshotCount;
    void selectAllMatchingVisibleSnapshotCount;

    const selectionValue: SearchSelectionContextValue = {
        ...publicSelectionState,
        hasSelectedTransactions,
        selectionDisplayCount,
    };

    const selectionActionsValue: SearchSelectionActionsValue = {
        setSelectedTransactions,
        applySelection,
        setSelectedReports,
        setCurrentSelectedTransactionReportID,
        clearSelectedTransactions,
        removeTransaction,
        selectAllMatchingItems,
    };

    return (
        <SearchSelectionContext value={selectionValue}>
            <SearchSelectionActionsContext value={selectionActionsValue}>{children}</SearchSelectionActionsContext>
        </SearchSelectionContext>
    );
}

/**
 * Derives `selectedReports` from the current selection + visible rows and syncs it into context.
 *
 * Note: `selectedTransactionIDs` and `selectedTransactions` are two separate properties.
 * Setting or clearing one of them does not influence the other.
 * IDs should be used if transaction details are not required.
 *
 * `data` is read via a ref so this effect only fires when `selectedTransactions` changes.
 * Without that, a `data` change (e.g. Onyx push) would fire this effect with a stale
 * `selectedTransactions` from closure and clobber any atomic update made in the same commit.
 */
function useSyncSelectedReports(data: SearchData) {
    const {selectedTransactions, areAllMatchingItemsSelected} = useSearchSelectionContext();
    const {setSelectedReports} = useSearchSelectionActions();

    const dataRef = useRef(data);
    const setSelectedReportsRef = useRef(setSelectedReports);
    setSelectedReportsRef.current = setSelectedReports;

    useEffect(() => {
        dataRef.current = data;
    });

    useEffect(() => {
        if (areAllMatchingItemsSelected) {
            return;
        }
        setSelectedReportsRef.current(deriveSelectedReports(selectedTransactions, dataRef.current));
        // `setSelectedReports` is read via a ref so this effect only runs when `selectedTransactions` changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTransactions, areAllMatchingItemsSelected]);
}

/** Narrow per-row selection read: whether the row for `keyForList` is selected (or covered by select-all). */
function useRowSelection(keyForList: string | undefined): {isSelected: boolean} {
    const {selectedTransactions, areAllMatchingItemsSelected, excludedTransactionsFromSelectAll} = useSearchSelectionContext();
    if (!keyForList) {
        return {isSelected: false};
    }
    if (areAllMatchingItemsSelected) {
        return {isSelected: !excludedTransactionsFromSelectAll?.[keyForList]};
    }
    return {isSelected: !!selectedTransactions[keyForList]?.isSelected};
}

/** Aggregate count of currently-selected transactions, for the selection top bar. */
function useSelectionCounts(): {selected: number} {
    const {selectionDisplayCount} = useSearchSelectionContext();
    return {selected: selectionDisplayCount};
}

export {SearchSelectionProvider, useSyncSelectedReports, useRowSelection, useSelectionCounts};
