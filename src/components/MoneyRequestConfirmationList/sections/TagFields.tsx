import React, {useState} from 'react';
import type {ValueOf} from 'type-fest';
import MenuItemWithTopDescription from '@components/MenuItemWithTopDescription';
import useLocalize from '@hooks/useLocalize';
import useThemeStyles from '@hooks/useThemeStyles';
import Navigation from '@libs/Navigation/Navigation';
import {getLengthOfTag} from '@libs/PolicyUtils';
import CONST from '@src/CONST';
import type {IOUAction, IOUType} from '@src/CONST';
import type {TranslationPaths} from '@src/languages/types';
import ROUTES from '@src/ROUTES';
import type * as OnyxTypes from '@src/types/onyx';
import {createTagDisplaySelector, tagSliceSelector} from './selectors';
import useTransactionSelector from './useTransactionSelector';

type TagFieldsProps = {
    policyTagList: ValueOf<OnyxTypes.PolicyTagLists>;
    isTagRequired: boolean;
    previousShouldShow: boolean;
    didConfirm: boolean;
    isReadOnly: boolean;
    transactionID: string | undefined;
    action: IOUAction;
    iouType: Exclude<IOUType, typeof CONST.IOU.TYPE.REQUEST | typeof CONST.IOU.TYPE.SEND>;
    reportID: string;
    reportActionID: string | undefined;
    formError: string;

    /** The global tag index used for navigation and display */
    tagIndex: number;
};

function TagFields({
    policyTagList,
    isTagRequired,
    previousShouldShow,
    didConfirm,
    isReadOnly,
    transactionID,
    action,
    iouType,
    reportID,
    reportActionID,
    formError,
    tagIndex,
}: TagFieldsProps) {
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const shouldDisplayTagError = formError === 'violations.tagOutOfPolicy';

    const tagDisplaySelector = createTagDisplaySelector(tagIndex);
    const tagDisplay = useTransactionSelector(transactionID, tagDisplaySelector);
    const transactionTag = useTransactionSelector(transactionID, tagSliceSelector)?.tag ?? '';

    const [previousTransactionTag, setPreviousTransactionTag] = useState(transactionTag);
    const [previousTag, setPreviousTag] = useState<string | undefined>(undefined);
    const [currentTransactionTag, setCurrentTransactionTag] = useState<string | undefined>(undefined);
    if (transactionTag !== previousTransactionTag) {
        setPreviousTransactionTag(transactionTag);
        setPreviousTag(previousTransactionTag);
        setCurrentTransactionTag(transactionTag);
    }

    const displayedTag = tagDisplay ?? '';
    const previousTagLength = getLengthOfTag(previousTag ?? '');
    const currentTagLength = getLengthOfTag(currentTransactionTag ?? '');
    const shouldHighlight = !displayedTag && !previousShouldShow && currentTagLength > previousTagLength;

    return (
        <MenuItemWithTopDescription
            highlighted={shouldHighlight}
            skipHighlightInitialFade
            shouldShowRightIcon={!isReadOnly}
            title={displayedTag}
            description={policyTagList.name}
            shouldShowBasicTitle
            shouldShowDescriptionOnTop
            numberOfLinesTitle={2}
            titleStyle={styles.flex1}
            onPress={() => {
                if (!transactionID) {
                    return;
                }

                Navigation.navigate(ROUTES.MONEY_REQUEST_STEP_TAG.getRoute(action, iouType, tagIndex, transactionID, reportID, Navigation.getActiveRoute(), reportActionID));
            }}
            style={[styles.moneyRequestMenuItem]}
            brickRoadIndicator={shouldDisplayTagError && !!displayedTag ? CONST.BRICK_ROAD_INDICATOR_STATUS.ERROR : undefined}
            errorText={shouldDisplayTagError && !!displayedTag ? translate(formError as TranslationPaths) : ''}
            disabled={didConfirm}
            interactive={!isReadOnly}
            rightLabel={isTagRequired ? translate('common.required') : ''}
            sentryLabel={CONST.SENTRY_LABEL.REQUEST_CONFIRMATION_LIST.TAG_FIELD}
        />
    );
}

export default TagFields;
