import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo} from 'react';
import {FlatList, View} from 'react-native';
import Button from '@components/Button';
import GenericEmptyStateComponent from '@components/EmptyStateComponent/GenericEmptyStateComponent';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import {usePersonalDetails} from '@components/OnyxListItemProvider';
import RenderHTML from '@components/RenderHTML';
import ScreenWrapper from '@components/ScreenWrapper';
import ScrollView from '@components/ScrollView';
import useChatWithAgent from '@hooks/useChatWithAgent';
import useDocumentTitle from '@hooks/useDocumentTitle';
import {useMemoizedLazyExpensifyIcons, useMemoizedLazyIllustrations} from '@hooks/useLazyAsset';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import usePermissions from '@hooks/usePermissions';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useSwitchToDelegator from '@hooks/useSwitchToDelegator';
import useThemeStyles from '@hooks/useThemeStyles';
import {buildAgentListItems} from '@libs/AgentUtils';
import type {AgentListItem} from '@libs/AgentUtils';
import Navigation from '@libs/Navigation/Navigation';
import NotFoundPage from '@pages/ErrorPage/NotFoundPage';
import {clearAgentDeleteError, clearAgentError, clearAgentUpdateError, openAgentsPage, purgeResurrectedDeletedAgents} from '@userActions/Agent';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {Errors, PendingAction} from '@src/types/onyx/OnyxCommon';
import AgentsListRow from './AgentsListRow';

function AgentsPage() {
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const {shouldUseNarrowLayout} = useResponsiveLayout();
    const illustrations = useMemoizedLazyIllustrations(['TvScreenRobot', 'AiBot']);
    const icons = useMemoizedLazyExpensifyIcons(['Plus']);
    const chatWithAgent = useChatWithAgent();
    const switchToDelegator = useSwitchToDelegator();
    const {isBetaEnabled} = usePermissions();
    const isCustomAgentEnabled = isBetaEnabled(CONST.BETAS.CUSTOM_AGENT);
    useDocumentTitle(translate('agentsPage.title'));

    const [agentPrompts] = useOnyx(ONYXKEYS.COLLECTION.SHARED_NVP_AGENT_PROMPT);
    const [deletionTombstones] = useOnyx(ONYXKEYS.AGENT_DELETION_TOMBSTONES);
    const personalDetailsList = usePersonalDetails();

    useFocusEffect(
        useCallback(() => {
            if (!isCustomAgentEnabled) {
                return;
            }
            openAgentsPage();
        }, [isCustomAgentEnabled]),
    );

    useEffect(() => {
        purgeResurrectedDeletedAgents(agentPrompts, personalDetailsList, deletionTombstones);
    }, [agentPrompts, personalDetailsList, deletionTombstones]);

    const agentItems = useMemo(() => buildAgentListItems(agentPrompts, personalDetailsList, deletionTombstones), [agentPrompts, personalDetailsList, deletionTombstones]);

    const handleErrorClose = (pendingAction: PendingAction | null | undefined, accountID: number) => {
        if (pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD) {
            clearAgentError(accountID);
        } else if (pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE) {
            clearAgentDeleteError(accountID);
        } else {
            clearAgentUpdateError(accountID);
        }
    };

    const shouldShowErrors = (pendingAction: PendingAction | null | undefined) =>
        pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD || pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE;

    const renderItem = ({item}: {item: AgentListItem}) => (
        <AgentsListRow
            accountID={item.accountID}
            displayName={item.displayName}
            login={item.login}
            pendingAction={item.pendingAction}
            errors={shouldShowErrors(item.pendingAction) ? item.errors : null}
            onErrorClose={() => handleErrorClose(item.pendingAction, item.accountID)}
            brickRoadIndicator={item.hasUpdateErrors ? CONST.BRICK_ROAD_INDICATOR_STATUS.ERROR : null}
            onChatPress={chatWithAgent}
            onCopilotPress={switchToDelegator}
        />
    );

    const keyExtractor = (item: AgentListItem) => String(item.accountID);

    const hasAgents = agentItems.length > 0;

    const newAgentButton = (
        <Button
            success
            icon={icons.Plus}
            text={translate('agentsPage.newAgent')}
            onPress={() => Navigation.navigate(ROUTES.SETTINGS_AGENTS_ADD.getRoute())}
        />
    );

    if (!isCustomAgentEnabled) {
        return <NotFoundPage />;
    }

    return (
        <ScreenWrapper
            enableEdgeToEdgeBottomSafeAreaPadding
            style={[styles.defaultModalContainer]}
            testID={AgentsPage.displayName}
            shouldShowOfflineIndicatorInWideScreen
            shouldMobileOfflineIndicatorStickToBottom={false}
            offlineIndicatorStyle={styles.mtAuto}
        >
            <HeaderWithBackButton
                icon={illustrations.AiBot}
                onBackButtonPress={() => Navigation.goBack()}
                shouldShowBackButton={shouldUseNarrowLayout}
                shouldUseHeadlineHeader
                shouldDisplaySearchRouter
                shouldDisplayHelpButton
                title={translate('agentsPage.title')}
            >
                {!shouldUseNarrowLayout && newAgentButton}
            </HeaderWithBackButton>
            {shouldUseNarrowLayout && <View style={[styles.ph5, styles.pb3]}>{newAgentButton}</View>}
            {hasAgents ? (
                <>
                    <View style={[styles.renderHTML, styles.ph5, styles.pb3, styles.pt3]}>
                        <RenderHTML html={translate('agentsPage.subtitle')} />
                    </View>
                    <FlatList
                        data={agentItems}
                        renderItem={renderItem}
                        keyExtractor={keyExtractor}
                    />
                </>
            ) : (
                <ScrollView contentContainerStyle={[styles.flexGrow1, styles.flexShrink0]}>
                    <GenericEmptyStateComponent
                        headerMedia={illustrations.TvScreenRobot}
                        title={translate('agentsPage.emptyAgents.title')}
                        subtitleText={
                            <View style={[styles.renderHTML, styles.agentsPageEmptyStateSubtitle]}>
                                <RenderHTML html={translate('agentsPage.emptyAgents.subtitle')} />
                            </View>
                        }
                        headerStyles={styles.emptyStateCardIllustrationContainer}
                        headerContentStyles={styles.agentsPageEmptyStateIllustration}
                    />
                </ScrollView>
            )}
        </ScreenWrapper>
    );
}

AgentsPage.displayName = 'AgentsPage';

export default AgentsPage;
