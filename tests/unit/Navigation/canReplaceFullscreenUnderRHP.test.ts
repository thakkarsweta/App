import type {NavigationRoute, ParamListBase, StackNavigationState} from '@react-navigation/native';
import {
    canReplaceFullscreenUnderRHP,
    handleReplaceFullscreenUnderRHP,
    willHandleReplaceFullscreenUnderRHP,
} from '@libs/Navigation/AppNavigator/createRootStackNavigator/GetStateForActionHandlers';
import getStateFromPath from '@libs/Navigation/helpers/getStateFromPath';
import {isFullScreenName} from '@libs/Navigation/helpers/isNavigatorName';
import {buildCannedSearchQuery} from '@libs/SearchQueryUtils';
import CONST from '@src/CONST';
import NAVIGATORS from '@src/NAVIGATORS';
import ROUTES from '@src/ROUTES';
import SCREENS from '@src/SCREENS';

function makeRoute(name: string, key?: string, params?: Record<string, unknown>, state?: StackNavigationState<ParamListBase>): NavigationRoute<ParamListBase, string> {
    return {key: key ?? name, name, params, state} as NavigationRoute<ParamListBase, string>;
}

function makeRootState(routes: Array<NavigationRoute<ParamListBase, string>>): StackNavigationState<ParamListBase> {
    return {
        key: 'root-stack',
        index: routes.length - 1,
        routeNames: routes.map((r) => r.name),
        routes,
        type: 'stack',
        stale: false as const,
        preloadedRoutes: [],
    };
}

describe('canReplaceFullscreenUnderRHP', () => {
    const searchRoute = ROUTES.SEARCH_ROOT.getRoute({
        query: buildCannedSearchQuery({type: CONST.SEARCH.DATA_TYPES.EXPENSE}),
    });

    const tabNavigatorWithSearchTab = makeRoute(NAVIGATORS.TAB_NAVIGATOR, 'tab-nav', undefined, {
        key: 'tab-state',
        index: 0,
        routeNames: [NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, NAVIGATORS.SEARCH_FULLSCREEN_NAVIGATOR],
        routes: [makeRoute(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, 'reports-tab'), makeRoute(NAVIGATORS.SEARCH_FULLSCREEN_NAVIGATOR, 'search-tab')],
        type: 'tab',
        stale: false as const,
        preloadedRoutes: [],
    });

    it('returns true when a modal sits on top of TabNavigator and the Search tab exists', () => {
        const state = makeRootState([tabNavigatorWithSearchTab, makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp')]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(true);
    });

    it('returns true when the Search tab has not been visited yet (lazy tabs)', () => {
        const tabNavigatorWithoutSearchTab = makeRoute(NAVIGATORS.TAB_NAVIGATOR, 'tab-nav-lazy', undefined, {
            key: 'tab-state-lazy',
            index: 0,
            routeNames: [SCREENS.HOME, NAVIGATORS.REPORTS_SPLIT_NAVIGATOR],
            routes: [makeRoute(SCREENS.HOME, 'home-tab'), makeRoute(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, 'reports-tab')],
            type: 'tab',
            stale: false as const,
            preloadedRoutes: [],
        });
        const state = makeRootState([tabNavigatorWithoutSearchTab, makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp')]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(true);
    });

    it('returns false when the top route is a fullscreen navigator instead of a modal', () => {
        const state = makeRootState([tabNavigatorWithSearchTab]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(false);
    });

    it('returns false when the top route is not the right modal navigator', () => {
        const state = makeRootState([tabNavigatorWithSearchTab, makeRoute(NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR, 'onboarding-modal')]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(false);
    });

    it('returns false when TabNavigator is missing from the stack under the modal', () => {
        const state = makeRootState([makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp-only')]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(false);
    });

    it('returns false when TabNavigator has no nested routes', () => {
        const emptyTabNavigator = makeRoute(NAVIGATORS.TAB_NAVIGATOR, 'empty-tab');
        const state = makeRootState([emptyTabNavigator, makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp')]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(false);
    });

    it('returns false for an invalid route path', () => {
        const state = makeRootState([tabNavigatorWithSearchTab, makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp')]);

        expect(canReplaceFullscreenUnderRHP(state, 'not-a-real-route' as typeof searchRoute)).toBe(false);
    });
});

describe('willHandleReplaceFullscreenUnderRHP', () => {
    const searchRoute = ROUTES.SEARCH_ROOT.getRoute({
        query: buildCannedSearchQuery({type: CONST.SEARCH.DATA_TYPES.EXPENSE}),
    });

    it('returns true for a real search path when TabNavigator sits under the RHP', () => {
        const stateFromPath = getStateFromPath(searchRoute);
        const targetRoute = stateFromPath?.routes.findLast((r) => isFullScreenName(r.name));
        expect(targetRoute?.name).toBe(NAVIGATORS.TAB_NAVIGATOR);

        const tabNavigatorWithoutSearchTab = makeRoute(NAVIGATORS.TAB_NAVIGATOR, 'tab-nav-lazy', undefined, {
            key: 'tab-state-lazy',
            index: 0,
            routeNames: [SCREENS.HOME, NAVIGATORS.REPORTS_SPLIT_NAVIGATOR],
            routes: [makeRoute(SCREENS.HOME, 'home-tab'), makeRoute(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, 'reports-tab')],
            type: 'tab',
            stale: false as const,
            preloadedRoutes: [],
        });
        const state = makeRootState([tabNavigatorWithoutSearchTab, makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp')]);

        expect(canReplaceFullscreenUnderRHP(state, searchRoute)).toBe(true);
        expect(willHandleReplaceFullscreenUnderRHP(state, searchRoute)).toBe(true);
    });
});

describe('handleReplaceFullscreenUnderRHP lazy tab support', () => {
    const searchRoute = ROUTES.SEARCH_ROOT.getRoute({
        query: buildCannedSearchQuery({type: CONST.SEARCH.DATA_TYPES.EXPENSE}),
    });

    it('inserts the Search tab when it is missing from lazy TabNavigator state', () => {
        const tabNavigatorWithoutSearchTab = makeRoute(NAVIGATORS.TAB_NAVIGATOR, 'tab-nav-lazy', undefined, {
            key: 'tab-state-lazy',
            index: 0,
            routeNames: [SCREENS.HOME, NAVIGATORS.REPORTS_SPLIT_NAVIGATOR],
            routes: [makeRoute(SCREENS.HOME, 'home-tab'), makeRoute(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, 'reports-tab')],
            type: 'tab',
            stale: false as const,
            preloadedRoutes: [],
        });
        const state = makeRootState([tabNavigatorWithoutSearchTab, makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, 'rhp')]);
        const stackRouter = {
            getRehydratedState: (nextState: StackNavigationState<ParamListBase>) => nextState,
            getStateForAction: () => null,
        };

        const nextState = handleReplaceFullscreenUnderRHP(
            state,
            {type: CONST.NAVIGATION.ACTION_TYPE.REPLACE_FULLSCREEN_UNDER_RHP, payload: {route: searchRoute}},
            {routeNames: [], routeParamList: {}, routeGetIdList: {}},
            stackRouter as never,
        );

        const tabRoute = nextState?.routes.find((route) => route.name === NAVIGATORS.TAB_NAVIGATOR);
        const tabState = tabRoute?.state;
        expect(tabState?.routes.some((route) => route.name === NAVIGATORS.SEARCH_FULLSCREEN_NAVIGATOR)).toBe(true);
        expect(tabState?.index).toBe(2);
    });
});
