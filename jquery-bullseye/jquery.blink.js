/*
jQuery Blink
Author: WonderGroup, Jordan Thomas
URL: http://labs.wondergroup.com/demos/mini-ui/index.html
License: MIT (http://en.wikipedia.org/wiki/MIT_License)
*/
jQuery.fn.blink = function (o) { var d = { speed: 200, blinks: 3, callback: null }; var o = jQuery.extend(d, o); return this.each(function () { var calls = 0; for (i = 1; i <= o.blinks; i++) { $(this).animate({ opacity: 0 }, o.speed).animate({ opacity: 1 }, o.speed, function () { calls++; if (calls == o.blinks && jQuery.isFunction(o.callback)) { o.callback(); } }); } }); };