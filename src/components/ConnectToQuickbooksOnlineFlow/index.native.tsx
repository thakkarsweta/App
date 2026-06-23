import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';
import type {WebViewOpenWindowEvent} from 'react-native-webview/lib/WebViewTypes';
import ActivityIndicator from '@components/ActivityIndicator';
import FullPageOfflineBlockingView from '@components/BlockingViews/FullPageOfflineBlockingView';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import Modal from '@components/Modal';
import useLocalize from '@hooks/useLocalize';
import useThemeStyles from '@hooks/useThemeStyles';
import {getQuickbooksOnlineSetupLink} from '@libs/actions/connections/QuickbooksOnline';
import {getShortLivedAuthTokenURL} from '@userActions/Link';
import {enablePolicyTaxes} from '@userActions/Policy/Policy';
import CONST from '@src/CONST';
import type {ConnectToQuickbooksOnlineFlowProps} from './types';

function ConnectToQuickbooksOnlineFlow({policyID}: ConnectToQuickbooksOnlineFlowProps) {
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const [isWebViewOpen, setIsWebViewOpen] = useState(true);
    const [popupUrl, setPopupUrl] = useState<string | null>(null);
    const [isPopupVisible, setIsPopupVisible] = useState(false);
    const [authenticatedUrl, setAuthenticatedUrl] = useState<string | null>(null);
    const hasFetched = useRef(false);

    const renderLoading = useCallback(
        () => (
            <View style={[StyleSheet.absoluteFill, styles.fullScreenLoading]}>
                <ActivityIndicator
                    size={CONST.ACTIVITY_INDICATOR_SIZE.LARGE}
                    reasonAttributes={{context: 'ConnectToQuickbooksOnlineFlow'}}
                />
            </View>
        ),
        [styles.fullScreenLoading],
    );

    useEffect(() => {
        enablePolicyTaxes(policyID, false);
        if (hasFetched.current) {
            return;
        }
        hasFetched.current = true;
        getShortLivedAuthTokenURL(getQuickbooksOnlineSetupLink(policyID)).then(setAuthenticatedUrl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleOpenWindow = (event: WebViewOpenWindowEvent) => {
        setPopupUrl(event.nativeEvent.targetUrl);
        setIsPopupVisible(true);
    };

    const handleBackButtonPress = () => {
        if (isPopupVisible) {
            setIsPopupVisible(false);
            return;
        }
        setIsWebViewOpen(false);
    };

    return (
        <Modal
            onClose={handleBackButtonPress}
            fullscreen
            isVisible={isWebViewOpen}
            type={CONST.MODAL.MODAL_TYPE.CENTERED_UNSWIPEABLE}
        >
            <HeaderWithBackButton
                title={translate('workspace.accounting.title')}
                onBackButtonPress={handleBackButtonPress}
                shouldDisplayHelpButton={false}
            />
            <FullPageOfflineBlockingView>
                <View style={styles.flex1}>
                    {!authenticatedUrl && renderLoading()}
                    {!!authenticatedUrl && (
                        <WebView
                            source={{uri: authenticatedUrl}}
                            onOpenWindow={handleOpenWindow}
                            startInLoadingState
                            renderLoading={renderLoading}
                        />
                    )}
                    {!!popupUrl && (
                        <View
                            style={[StyleSheet.absoluteFill, !isPopupVisible && styles.opacity0]}
                            pointerEvents={isPopupVisible ? 'auto' : 'none'}
                        >
                            <WebView
                                source={{uri: popupUrl}}
                                onOpenWindow={handleOpenWindow}
                                startInLoadingState
                                renderLoading={renderLoading}
                            />
                        </View>
                    )}
                </View>
            </FullPageOfflineBlockingView>
        </Modal>
    );
}

export default ConnectToQuickbooksOnlineFlow;
