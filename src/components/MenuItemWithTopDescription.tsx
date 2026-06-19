import React from 'react';
import useAnimatedHighlightStyle from '@hooks/useAnimatedHighlightStyle';
import useTheme from '@hooks/useTheme';
import MenuItem from './MenuItem';
import type {MenuItemProps} from './MenuItem';

type MenuItemWithTopDescriptionProps = MenuItemProps & {
    /** Should the menu item be highlighted? */
    highlighted?: boolean;

    /** When true, the highlight animation starts fully visible instead of fading in from opacity 0 */
    skipHighlightInitialFade?: boolean;
};

function MenuItemWithTopDescription({highlighted, skipHighlightInitialFade, outerWrapperStyle, ref, ...props}: MenuItemWithTopDescriptionProps) {
    const theme = useTheme();
    const highlightedOuterWrapperStyle = useAnimatedHighlightStyle({
        shouldHighlight: highlighted ?? false,
        highlightColor: theme.messageHighlightBG,
        itemEnterDelay: 0,
        skipInitialFade: skipHighlightInitialFade,
    });

    return (
        <MenuItem
            {...props}
            ref={ref}
            shouldShowBasicTitle
            shouldShowDescriptionOnTop
            outerWrapperStyle={highlighted ? highlightedOuterWrapperStyle : outerWrapperStyle}
        />
    );
}

export default MenuItemWithTopDescription;
