import {useIsFocused} from '@react-navigation/native';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';
import type {NativeScrollEvent, NativeSyntheticEvent, ViewToken} from 'react-native';
import {readNewestAction} from '@userActions/Report';
import CONST from '@src/CONST';

type Args = {
    /** The report ID */
    reportID: string;

    /** Whether the FlatList is inverted, we need it to determine if the current unread message is visible. */
    isInverted: boolean;

    /** The current offset of scrolling from either top or bottom of chat list */
    currentVerticalScrollingOffsetRef: RefObject<number>;

    /** Ref for whether read action was skipped */
    readActionSkippedRef: RefObject<boolean>;

    /** The index of the unread report action */
    unreadMarkerReportActionIndex: number;

    /** Whether the report has newer actions to load */
    hasNewerActions: boolean;

    /** Callback to call on every scroll event */
    onTrackScrolling: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

    /** Whether the report actions have been loaded at least once */
    hasOnceLoadedReportActions: boolean;

    /** The index of the action badge target report action in the sorted visible actions list (-1 if none) */
    actionBadgeTargetIndex?: number;

    /** Report action IDs for all Fix badge targets in the rendered list (oldest first) */
    actionBadgeTargetReportActionIDs?: string[];

    /** Indexes in the rendered list corresponding to actionBadgeTargetReportActionIDs */
    actionBadgeTargetIndexes?: number[];
};

function isReportActionWithID(item: unknown): item is {reportActionID: string} {
    return typeof item === 'object' && item !== null && 'reportActionID' in item && typeof (item as {reportActionID?: unknown}).reportActionID === 'string';
}

function getVisibleReportActionIDs(viewableItems: ViewToken[]): Set<string> {
    const visibleIDs = new Set<string>();
    for (const viewableItem of viewableItems) {
        if (isReportActionWithID(viewableItem.item)) {
            visibleIDs.add(viewableItem.item.reportActionID);
        } else if (viewableItem.key && viewableItem.key !== CONST.REPORT.ACTIONS.TYPE.CREATED) {
            visibleIDs.add(viewableItem.key);
        }
    }
    return visibleIDs;
}

function getNearestOffscreenAboveTargetIndex(targetIndexes: number[], minIndex: number, maxIndex: number, isInverted: boolean): number {
    const offscreenAboveIndexes = targetIndexes.filter((targetIndex) => (isInverted ? targetIndex > maxIndex : targetIndex < minIndex));
    if (offscreenAboveIndexes.length === 0) {
        return -1;
    }

    return isInverted ? Math.min(...offscreenAboveIndexes) : Math.max(...offscreenAboveIndexes);
}

export default function useReportUnreadMessageScrollTracking({
    reportID,
    currentVerticalScrollingOffsetRef,
    hasNewerActions,
    readActionSkippedRef,
    onTrackScrolling,
    unreadMarkerReportActionIndex,
    isInverted,
    hasOnceLoadedReportActions,
    actionBadgeTargetIndex = -1,
    actionBadgeTargetReportActionIDs = [],
    actionBadgeTargetIndexes = [],
}: Args) {
    const [isFloatingMessageCounterVisible, setIsFloatingMessageCounterVisible] = useState(false);
    const [isActionBadgeAboveViewport, setIsActionBadgeAboveViewport] = useState(false);
    const [actionBadgeScrollTargetIndex, setActionBadgeScrollTargetIndex] = useState(-1);
    const isFocused = useIsFocused();
    const ref = useRef<{
        previousViewableItems: ViewToken[];
        reportID: string;
        unreadMarkerReportActionIndex: number;
        isFocused: boolean;
        hasOnceLoadedReportActions: boolean;
        actionBadgeTargetIndex: number;
        actionBadgeTargetReportActionIDs: string[];
        actionBadgeTargetIndexes: number[];
    }>({
        reportID,
        unreadMarkerReportActionIndex,
        previousViewableItems: [],
        isFocused: true,
        hasOnceLoadedReportActions,
        actionBadgeTargetIndex,
        actionBadgeTargetReportActionIDs,
        actionBadgeTargetIndexes,
    });
    // We want to save the updated value on ref to use it in onViewableItemsChanged
    // because FlatList requires the callback to be stable and we cannot add a dependency on the useCallback.
    useEffect(() => {
        ref.current.reportID = reportID;
        ref.current.previousViewableItems = [];
    }, [reportID]);

    useEffect(() => {
        ref.current.isFocused = isFocused;
    }, [isFocused]);

    useEffect(() => {
        ref.current.hasOnceLoadedReportActions = hasOnceLoadedReportActions;
    }, [hasOnceLoadedReportActions]);

    /**
     * On every scroll event we want to:
     * Show/hide the latest message pill when user is scrolling back/forth in the history of messages.
     * Call any other callback that the component might need
     */
    const trackVerticalScrolling = (event: NativeSyntheticEvent<NativeScrollEvent> | undefined) => {
        if (event) {
            onTrackScrolling(event);
        }
        const hasUnreadMarkerReportAction = unreadMarkerReportActionIndex !== -1;

        // display floating button if we're scrolled more than the offset
        if (
            currentVerticalScrollingOffsetRef.current > CONST.REPORT.ACTIONS.LATEST_MESSAGES_PILL_SCROLL_OFFSET_THRESHOLD &&
            !isFloatingMessageCounterVisible &&
            !hasUnreadMarkerReportAction
        ) {
            setIsFloatingMessageCounterVisible(true);
        }

        // hide floating button if we're scrolled closer than the offset
        if (
            currentVerticalScrollingOffsetRef.current < CONST.REPORT.ACTIONS.LATEST_MESSAGES_PILL_SCROLL_OFFSET_THRESHOLD &&
            isFloatingMessageCounterVisible &&
            !hasUnreadMarkerReportAction &&
            !hasNewerActions
        ) {
            setIsFloatingMessageCounterVisible(false);
        }
    };

    const onViewableItemsChanged = useCallback(({viewableItems}: {viewableItems: ViewToken[]; changed: ViewToken[]}) => {
        if (!ref.current.isFocused) {
            return;
        }

        ref.current.previousViewableItems = viewableItems;
        const viewableIndexes = viewableItems.map((viewableItem) => viewableItem.index).filter((value) => typeof value === 'number');

        if (viewableIndexes.length === 0) {
            return;
        }

        const maxIndex = Math.max(...viewableIndexes);
        const minIndex = Math.min(...viewableIndexes);
        const unreadActionIndex = ref.current.unreadMarkerReportActionIndex;
        const hasUnreadMarkerReportAction = unreadActionIndex !== -1;
        const unreadActionVisible = isInverted ? unreadActionIndex >= minIndex : unreadActionIndex <= maxIndex;

        // display floating button if the unread report action is out of view
        if (!unreadActionVisible && hasUnreadMarkerReportAction) {
            setIsFloatingMessageCounterVisible(true);
        }
        // hide floating button if the unread report action becomes visible
        if (unreadActionVisible && hasUnreadMarkerReportAction) {
            setIsFloatingMessageCounterVisible(false);
        }

        // if we're scrolled closer than the offset and read action has been skipped then mark message as read
        if (unreadActionVisible && readActionSkippedRef.current) {
            // eslint-disable-next-line no-param-reassign
            readActionSkippedRef.current = false;
            readNewestAction(ref.current.reportID, ref.current.hasOnceLoadedReportActions);
        }

        const visibleReportActionIDs = getVisibleReportActionIDs(viewableItems);
        const badgeTargetReportActionIDs = ref.current.actionBadgeTargetReportActionIDs;
        const badgeTargetIndexes = ref.current.actionBadgeTargetIndexes.length > 0 ? ref.current.actionBadgeTargetIndexes : [ref.current.actionBadgeTargetIndex];

        const offscreenAboveTargetIndexes = badgeTargetIndexes
            .map((targetIndex, index) => ({
                targetIndex,
                targetID: badgeTargetReportActionIDs.at(index),
            }))
            .filter(({targetIndex, targetID}) => {
                if (targetIndex === -1) {
                    return false;
                }

                const isOffscreenAbove = isInverted ? targetIndex > maxIndex : targetIndex < minIndex;
                if (!isOffscreenAbove) {
                    return false;
                }

                // Guard against stale viewability snapshots after list inserts: only treat a target as offscreen when its reportActionID is not visible.
                return !targetID || !visibleReportActionIDs.has(targetID);
            })
            .map(({targetIndex}) => targetIndex);

        const isAbove = offscreenAboveTargetIndexes.length > 0;
        setIsActionBadgeAboveViewport(isAbove);
        setActionBadgeScrollTargetIndex(isAbove ? getNearestOffscreenAboveTargetIndex(offscreenAboveTargetIndexes, minIndex, maxIndex, isInverted) : -1);

        // FlatList requires a stable onViewableItemsChanged callback for optimal performance.
        // Therefore, we use a ref to store values instead of adding them as dependencies.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When unreadMarkerReportActionIndex changes we will manually call onViewableItemsChanged with previousViewableItems to recalculate
    // the state of floating button because onViewableItemsChanged on  FlatList will only be called when viewable items change.
    useEffect(() => {
        ref.current.unreadMarkerReportActionIndex = unreadMarkerReportActionIndex;

        if (ref.current.previousViewableItems.length) {
            onViewableItemsChanged({viewableItems: ref.current.previousViewableItems, changed: []});
        }
    }, [onViewableItemsChanged, unreadMarkerReportActionIndex]);

    // When action badge targets change, recalculate visibility
    useEffect(() => {
        ref.current.actionBadgeTargetIndex = actionBadgeTargetIndex;
        ref.current.actionBadgeTargetReportActionIDs = actionBadgeTargetReportActionIDs;
        ref.current.actionBadgeTargetIndexes = actionBadgeTargetIndexes;
        onViewableItemsChanged({viewableItems: ref.current.previousViewableItems, changed: []});
    }, [onViewableItemsChanged, actionBadgeTargetIndex, actionBadgeTargetReportActionIDs, actionBadgeTargetIndexes]);

    return {
        isFloatingMessageCounterVisible,
        setIsFloatingMessageCounterVisible,
        isActionBadgeAboveViewport,
        actionBadgeScrollTargetIndex,
        trackVerticalScrolling,
        onViewableItemsChanged,
    };
}
