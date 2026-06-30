import Config from 'react-native-config';
import getPlatform from '@libs/getPlatform';
import CONFIG from '@src/CONFIG';
import CONST from '@src/CONST';
import getEnvironment from './getEnvironment';
import type Environment from './getEnvironment/types';

const ENVIRONMENT_URLS = {
    [CONST.ENVIRONMENT.DEV]: CONST.DEV_NEW_EXPENSIFY_URL + CONFIG.DEV_PORT,
    [CONST.ENVIRONMENT.STAGING]: CONST.STAGING_NEW_EXPENSIFY_URL,
    [CONST.ENVIRONMENT.PRODUCTION]: CONST.NEW_EXPENSIFY_URL,
    [CONST.ENVIRONMENT.ADHOC]: CONST.STAGING_NEW_EXPENSIFY_URL,
};

const OLDDOT_ENVIRONMENT_URLS = {
    [CONST.ENVIRONMENT.DEV]: CONST.INTERNAL_DEV_EXPENSIFY_URL,
    [CONST.ENVIRONMENT.STAGING]: CONST.STAGING_EXPENSIFY_URL,
    [CONST.ENVIRONMENT.PRODUCTION]: CONST.EXPENSIFY_URL,
    [CONST.ENVIRONMENT.ADHOC]: CONST.STAGING_EXPENSIFY_URL,
};

/**
 * Are we running the app in development?
 */
function isDevelopment(): boolean {
    return (Config?.ENVIRONMENT ?? CONST.ENVIRONMENT.DEV) === CONST.ENVIRONMENT.DEV;
}

/**
 * Are we running the app in production?
 */
function isProduction(): Promise<boolean> {
    return getEnvironment().then((environment) => environment === CONST.ENVIRONMENT.PRODUCTION);
}

/**
 * Are we running an internal test build?
 */
function isInternalTestBuild(): boolean {
    return !!((Config?.ENVIRONMENT ?? CONST.ENVIRONMENT.DEV) === CONST.ENVIRONMENT.ADHOC && (CONST.PULL_REQUEST_NUMBER ?? ''));
}

/**
 * Get the URL based on the environment we are in
 */
function getEnvironmentURL(): Promise<string> {
    return new Promise((resolve) => {
        getEnvironment().then((environment) => resolve(ENVIRONMENT_URLS[environment]));
    });
}

/**
 * Given the environment get the corresponding oldDot URL
 */
function getOldDotURLFromEnvironment(environment: Environment): string {
    return OLDDOT_ENVIRONMENT_URLS[environment];
}

/**
 * Returns the OldDot host to use for secure file downloads (CSV exports, PDF reports, etc.).
 * On local web dev the API proxy forwards to production www.expensify.com, so secure downloads must
 * use the same host — getOldDotURLFromEnvironment(DEV) points at www.expensify.com.dev, which is
 * only reachable with a VM /etc/hosts entry.
 */
function getSecureDownloadBaseURL(environment: Environment): string {
    if (environment === CONST.ENVIRONMENT.DEV && CONFIG.IS_USING_WEB_PROXY && getPlatform() === 'web' && CONFIG.EXPENSIFY.DEFAULT_API_ROOT === '/') {
        return CONST.EXPENSIFY_URL;
    }

    return getOldDotURLFromEnvironment(environment);
}

/**
 * Get the corresponding oldDot URL based on the environment we are in
 */
function getOldDotEnvironmentURL(): Promise<string> {
    return getEnvironment().then((environment) => OLDDOT_ENVIRONMENT_URLS[environment]);
}

export {isInternalTestBuild, isDevelopment, isProduction, getEnvironmentURL, getOldDotEnvironmentURL, getOldDotURLFromEnvironment, getSecureDownloadBaseURL};
