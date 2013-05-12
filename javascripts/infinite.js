//function to parse input arguments from url
function gup(name)
{
  name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
  var regexS = "[\\?&]"+name+"=([^&#]*)";
  var regex = new RegExp( regexS );
  var results = regex.exec( window.location.href );
  if( results == null )
    return "";
  else
    return results[1];
}

//arguments needed for ajax.php
var feed_param = gup('feeds');
var category_param = gup('categories');
var article_id = gup('article_id');
var status_param = gup('status');

(function($) {

	$.fn.scrollPagination = function(options) {
		
		var settings = { 
			nop     : 10, // The number of posts per scroll to be loaded
			offset  : 0, // Initial offset, begins at 0 in this case
			error   : 'No More Posts!', // When the user reaches the end this is the message that is
			                            // displayed. You can change this if you want.
			delay   : 500, // When you scroll down the posts will load after a delayed amount of time.
			               // This is mainly for usability concerns. You can alter this as you see fit
			scroll  : true // The main bit, if set to false posts will not load as the user scrolls. 
			               // but will still load if the user clicks.
		}
		
		// Extend the options so they work with the plugin
		if(options) {
			$.extend(settings, options);
		}
		
		// For each so that we keep chainability.
		return this.each(function() {		
			
			// Some variables 
			$this = $(this);
			$settings = settings;
			var offset = $settings.offset;
			var busy = false; // Checks if the scroll action is happening so we don't run it multiple times
			
			// Custom messages based on settings
			if($settings.scroll == true) $initmessage = 'Scroll for more or click here';
			else $initmessage = 'Click for more';
			
			// Append custom messages and extra UI
			$this.append('<div class="content"></div><div class="loading-bar" id="loading-bar">'+$initmessage+'</div>');
			
			function getData() {
				
				// Post data to ajax.php
				$.post('ajax.php', {
						
				    action        : 'scrollpagination',
				    number        : $settings.nop,
				    offset        : offset,
				    feed_name	  : feed_param,
				    category_name : category_param,
				    article_id    : article_id,
				    status        : status_param,
				    
				}, function(data) {

					//log message
					console.log('fetching data for offset:' + offset);
						
					// Change loading bar content (it may have been altered)
					$this.find('.loading-bar').html($initmessage);
						
					// If there is no data returned, there are no more posts to be shown. Show error
					if(data == "") { 
						$this.find('.loading-bar').html($settings.error);	
					}
					else {
					    
						// Append the data to the content div
					   	$this.find('.content').append(data);

						// Add bullseye function to article headers
						// TODO: do not target previous added article headers
						$('div#block h3').on('leaveviewport', myHandler).bullseye();

                                                // Offset increases
                                                offset = offset+$settings.nop;

						// No longer busy!	
						busy = false;
					}	
						
				});
					
			}	
			
			getData(); // Run function initially
			
			// If scrolling is enabled
			if($settings.scroll == true) {
				// .. and the user is scrolling
				$(window).scroll(function() {
					
					// Check the user is at the bottom of the element
					//TODO: rewrite to use viewport detection or fix scrollTop

					var scrollheight = $(window).scrollTop() + $(window).height();
			
					if(scrollheight > $this.height() && !busy) {

						console.log('maximum scrollheight reached, reloading ajax.php');
						
						// Now we are working, so busy is true
						busy = true;
						
						// Tell the user we're loading posts
						$this.find('.loading-bar').html('Loading Posts');
						
						// Run the function to fetch the data inside a delay
						// This is useful if you have content in a footer you
						// want the user to see.
						setTimeout(function() {
							
							getData();
							
						}, $settings.delay);
							
					}	
				});
			}
			
			// Also content can be loaded by clicking the loading bar/
			$this.find('.loading-bar').click(function() {
			
				if(busy == false) {
					busy = true;
					getData();
				}
			
			});
			
		});
	}

})(jQuery);

