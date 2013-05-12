/*!
* jQuery Bullseye v1.0
* http://pixeltango.com
*
* Copyright 2010, Mickel Andersson
* Dual licensed under the MIT or GPL Version 2 licenses.
*
* Date: Fri Aug 31 19:09:11 2010 +0100
*/
jQuery.fn.bullseye = function (settings, viewport) {
    settings = jQuery.extend({
        offsetTop: 0,
        offsetHeight: 0,
        extendDown: false
    }, settings);

    var isFocusedKey = 'is-focused';

    return this.each(function () {
        var
            $element = $(this),
            $viewport = $(viewport == null ? window : viewport);

        var magic = function () {
            var 
                elementWidth = $element.outerWidth(),
                elementHeight = $element.outerHeight() + settings.offsetHeight,
                viewportWidth = $viewport.width(),
                viewportHeight = $viewport.height(),

                scrollTop = $viewport.scrollTop(),
                scrollLeft = $viewport.scrollLeft(),
                scrollRight = scrollLeft + elementWidth,
                scrollBottom = scrollTop + viewportHeight,

                x1 = $element.offset().left,
                x2 = x1 + elementWidth,
				y1 = $element.offset().top + settings.offsetTop,
				y2 = y1 + elementHeight;

            // Element is inside the viewport
            var insideViewport = function () {
                if (!isFocused($element)) {
                    setFocused($element);

                    $element.trigger('enterviewport');
                }
            }

            // Element is outside the viewport
            var outsideViewport = function () {
                if (isFocused($element)) {
                    clearFocused($element);

                    $element.trigger('leaveviewport');
                }
            }

            // Evaluate if the target is inside the viewport
            if (
                (scrollBottom < y1 || (settings.extendDown ? false : scrollTop > y2)) ||
                (scrollRight < x1 || scrollRight > x2)
            )
                outsideViewport();
            else
                insideViewport();
        };

        $viewport
            .scroll(magic)
            .resize(magic);

        magic();
    });

    function isFocused($element) {
        return $element.data(isFocusedKey);
    }

    function setFocused($element) {
        $element.data(isFocusedKey, true);
    }

    function clearFocused($element) {
        $element.data(isFocusedKey, false);
    }
};