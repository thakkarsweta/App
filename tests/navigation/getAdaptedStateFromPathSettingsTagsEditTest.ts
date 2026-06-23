import createDynamicRoute from '@libs/Navigation/helpers/dynamicRoutesUtils/createDynamicRoute';
import findAllMatchingDynamicSuffixes from '@libs/Navigation/helpers/dynamicRoutesUtils/findAllMatchingDynamicSuffixes';
import findFocusedRouteWithOnyxTabGuard from '@libs/Navigation/helpers/findFocusedRouteWithOnyxTabGuard';
import getAdaptedStateFromPath from '@libs/Navigation/helpers/getAdaptedStateFromPath';
import getStateFromPath from '@libs/Navigation/helpers/getStateFromPath';
import ROUTES, {DYNAMIC_ROUTES} from '@src/ROUTES';
import SCREENS from '@src/SCREENS';

describe('getAdaptedStateFromPath settings tags edit', () => {
    it('should include both ambiguous edit suffix patterns so tags edit can be resolved', () => {
        const policyID = 'ABC12345';
        const backTo = 'create/submit/tag/0/transaction123/report456';
        const orderWeight = 0;
        const path = createDynamicRoute(DYNAMIC_ROUTES.SETTINGS_TAGS_EDIT.getRoute(orderWeight), ROUTES.SETTINGS_TAGS_SETTINGS.getRoute(policyID, backTo));

        const suffixPatterns = findAllMatchingDynamicSuffixes(path).map((match) => match.pattern);

        expect(suffixPatterns).toEqual(expect.arrayContaining([DYNAMIC_ROUTES.SETTINGS_TAGS_EDIT.path, DYNAMIC_ROUTES.WORKSPACE_EXPENSIFY_CARD_ISSUE_NEW_SPEND_RULE_MERCHANT_EDIT.path]));
    });

    it('should resolve custom tag name edit route with policyID from explicit settings base path', () => {
        const policyID = 'ABC12345';
        const backTo = 'create/submit/tag/0/transaction123/report456';
        const orderWeight = 0;
        const path = createDynamicRoute(DYNAMIC_ROUTES.SETTINGS_TAGS_EDIT.getRoute(orderWeight), ROUTES.SETTINGS_TAGS_SETTINGS.getRoute(policyID, backTo));

        const state = getAdaptedStateFromPath(path);
        const focusedRoute = findFocusedRouteWithOnyxTabGuard(state ?? {});

        expect(focusedRoute?.name).toBe(SCREENS.SETTINGS_TAGS.DYNAMIC_SETTINGS_TAGS_EDIT);
        expect(focusedRoute?.params).toEqual(expect.objectContaining({policyID, orderWeight: `${orderWeight}`}));
    });

    it('should not resolve custom tag name edit route when built from money request tag step base path', () => {
        const path = createDynamicRoute(DYNAMIC_ROUTES.SETTINGS_TAGS_EDIT.getRoute(0), `create/submit/tag/0/transaction123/report456`);

        const state = getStateFromPath(path);
        const focusedRoute = findFocusedRouteWithOnyxTabGuard(state ?? {});

        expect(focusedRoute?.name).not.toBe(SCREENS.SETTINGS_TAGS.DYNAMIC_SETTINGS_TAGS_EDIT);
    });
});
