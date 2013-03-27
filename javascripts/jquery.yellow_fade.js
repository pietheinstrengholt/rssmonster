/*
 * jQuery yellowFade plugin
 *
 * Copyright (c) 2012 Andrey Sidorov
 * licensed under MIT license.
 *
 * https://github.com/morr/jquery.yellowFade/
 *
 * Version: 1.0.0
 */
(function($) {
  $.fn.yellowFade = function() {
    return this.each(function() {
      var $this = $(this);
      $this.stop(true, true);
      var original_color = $this.css('background-color');
      var transparent = false;
      if (original_color == 'transparent' || original_color == '' || original_color == 'rgba(0, 0, 0, 0)') {
        original_color = '#FFFFFF';
        transparent = true;
      }
      if (original_color.match(/^rgb\(/)) {
        original_color = rgb2hex(original_color);
      }
      $this.css('background-color', '#ffffcc').animate({'background-color': original_color}, 1500, function() {
          if (transparent) {
            $(this).css('background-color', 'transparent');
          }
        });
    });

  }

  function rgb2hex(rgb) {
    var hexDigits = ["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    function hex(x) {
      return isNaN(x) ? "00" : hexDigits[(x - x % 16) / 16] + hexDigits[x % 16];
    }
    return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
  }
})(jQuery);
