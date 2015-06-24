//check if cookies are set
if ($.cookie('type') == undefined) { $.cookie('type', 'status', { expires: 14 }); }
if ($.cookie('value') == undefined) { $.cookie('value', 'unread', { expires: 14 }); }
if ($.cookie('sort') == undefined) { $.cookie('sort', 'desc', { expires: 14 }); }
if ($.cookie('view') == undefined) { $.cookie('view', 'detailed', { expires: 14 }); }

//run loadcontent function once page is ready
$(document).ready(function () {

	//dropdown toggle
	$('.dropdown-toggle').dropdown();

	loadcontent($.cookie('type'), $.cookie('value'), $.cookie('sort'), $.cookie('view'));

	//loaddetailedview function to load items when scrolling. Remember to use: $(window).off("scroll");
	function loadcontent(load_type, load_value, load_sort, load_view) {
	
		//set new cookies
		$.cookie('type', load_type, { expires: 14 });
		$.cookie('value', load_value, { expires: 14 });
		$.cookie('sort', load_sort, { expires: 14 });
		$.cookie('view', load_view, { expires: 14 });
		
		//avoid overflow
		$('sidebar').css({'overflow-y': 'hidden'});
		
		//set view type
		$("section").removeClass();
		$("section").addClass($.cookie('view'));

		//empty poolid and articleList array's
		poolid = [];
		articleList = [];

		//destroy waypoint functions, avoid many items being called, see infinite.js
		$('div#block h4').waypoint('destroy');

		//set category, feed and status variables
		if (load_type == 'category_id') { var category_id = load_value; }
		if (load_type == 'feed_id') { var feed_id = load_value; }
		if (load_type == 'status') { var status = load_value; }

		//remove content and offload scroll
		$('section').empty();
		$('section #content').remove();
		$('section').append('<div id="content"></div>');
		$(window).off("scroll");

		//use small amount of timeout when calling scrollPagination
		setTimeout(function () {
			$('#content').scrollPagination({
				nop: 10, // The number of posts per scroll to be loaded
				offset: 10, // Initial offset, begins at 0 in this case
				error: 'No More Posts - All items marked as read!', // When the user reaches the end this is the message that is
				delay: 100, // When you scroll down the posts will load after a delayed amount of time.
				scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
				category_id: category_id, // Catch category from menu
				feed_id: feed_id, // Catch feedname from menu
				status: status, // Catch status from menu
				sort: load_sort // Catch sort
			});
		}, 100);
	}

	//Functionality when clicking on sections in sidebar
	$("div#status.panel a.list-group-item").click(function () {

		//remove and add clicked status to class
		$('div#status.panel').find('.active').removeClass("active");
		$('div#categories.panel').find('.active').removeClass("active");
		$("div.menu-sub").hide();
		$(this).addClass("active");

		//load content
		var status = $(this).find('span#title-name').text();
		var encoded_status = encodeURIComponent(status);
		loadcontent('status', encoded_status, $.cookie('sort'), $.cookie('view'))

	});

	//Functionality when clicking on top-nav menu items in header page
	$("a#starred.navbar-brand,a#unread.navbar-brand").click(function () {
		var status = $(this).attr('id');
		var encoded_status = encodeURIComponent(status);
		loadcontent('status', encoded_status, $.cookie('sort'), $.cookie('view'));
	});

	//Category function on sidebar: Drop down menu sub-menu items when a category is clicked
	//hide sub menu by default
	$("div.menu-sub").hide();
	$("div#categories.panel a.list-group-item.main").click(function () {

		//remove any active clicked classes from status overview
		$('div#categories.panel').find('.active').removeClass("active");
		$('div#status.panel').find('.active').removeClass("active");
		$(this).addClass("active");

		//open submenu
		$(this).next("div.menu-sub").slideToggle(200);

		//remove and add active classes, needed for decreasing dynamic count
		$('div.sidebar').find('.active-sub').removeClass("active");

		//change styling and arrow
		if ($(this).hasClass("collapsed")) {
			$(this).removeClass("collapsed");
			$(this).find('span.glyphicon.glyphicon-chevron-down').attr('class', 'glyphicon glyphicon-chevron-right');
		} else {
			$(this).addClass("collapsed");
			$(this).find('span.glyphicon.glyphicon-chevron-right').attr('class', 'glyphicon glyphicon-chevron-down');
		}

		//load content
		var category_id = $(this).attr('id');
		loadcontent('category_id', category_id, $.cookie('sort'), $.cookie('view'))

	});

	//Functionality when sub menu item from categories is clicked
	$("div#categories.panel a.list-group-item.sub").click(function () {

		//remove any active clicked classes from status overview
		$('div#categories.panel').find('.active').removeClass("active");
		$(this).addClass("active");

		//load content
		var feed_id = $(this).attr('id');
		loadcontent('feed_id', feed_id, $.cookie('sort'), $.cookie('view'))
	});

	//Set viewtype (list, detailed or minimal) button from topnav menu
	$("a.view-type").click(function () {
		var new_load_view = $(this).attr("id");
		loadcontent($.cookie('type'), $.cookie('value'), $.cookie('sort'), new_load_view)
	});

	//Sort button from topnav menu
	$("a.sort-order").click(function () {
		var new_load_sort = $(this).attr("id");
		loadcontent($.cookie('type'), $.cookie('value'), new_load_sort, $.cookie('view'))
	});

	//Show update screen in section
	$("a.update").click(function () {
		//show progress bar while loading
		console.log("update feeds initialized");
		$(window).off("scroll");
		$('section').empty();
		$('section').load('update.php');
	});

	//Load organize feeds section
	$("div.organize button.mark-all-as-read").click(function () {
		console.log("mark-all-as-read button clicked");
		$.ajax({
			type: "POST",
			url: "json.php",
			data: JSON.stringify({
				"jsonrpc": "2.0",
				"update": "mark-all-as-read"
			}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
			async: false,
			success: function (json) {
				result = json;
				//scroll to top before refresh
				document.body.scrollTop = document.documentElement.scrollTop = 0;
				//refresh page to load new articles
				location.reload();
			},
			failure: function (errMsg) {}
		});
	});

	//TODO: show read and unread buttons
	$("section").on("click", "div#block", function (event) {
		$("section").find("div#block.active").removeClass("active");
		$(this).addClass("active");
		$(this).find('div.options').show();
		$(this).find(".page-content").show();
		$(this).find(".less-content").hide()
	});

	//event when starring or un-staring item
	$("body").on("click", "div.item-star", function (event) {
		//get id
		var id = $(this).attr('id');
		//get current starred count
		var starredcount = $('div#status.panel a#starred.list-group-item span.badge').text();
	
		//remove classes, set new count and variables
		if ($(this).hasClass("unstar")) {
			$(this).removeClass("unstar");
			$(this).addClass("star");
			var starmark = "mark";
			var starredcountnew = parseFloat(starredcount)+1;
		} else {
			$(this).removeClass("star");
			$(this).addClass("unstar");
			var starmark = "unmark";
			var starredcountnew = parseFloat(starredcount)-1;	
		}
		
		//send json request
		$.ajax({
			type: "POST",
			url: "json.php",
			data: JSON.stringify({
				"jsonrpc": "2.0",
				"update": "star-" + starmark,
				"value": id
			}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
			async: false,
			success: function (json) {
				result = json;
			},
			failure: function (errMsg) {}
		});

		//change badges with new count
		$('span.starred.badge').each(function(index, obj) {
		  $(this).text(starredcountnew);
		});

	});

});

//Create pool array to remember which items are marked as read
var poolid = new Array();

//Pool function to mark items as read and to avoid items are set to read more then once
function FnReadPool(articleId) {

	//check if articleId is already in the Pool
	if (jQuery.inArray(articleId, poolid) == -1) {

		setTimeout(function() {
			console.log("viewport:" + articleId);
		}, 300);

		$.ajax({
			type: "POST",
			url: "json.php",
			data: JSON.stringify({
				"jsonrpc": "2.0",
				"update": "mark-item-as-read",
				"value": articleId
			}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
			success: function (data) {

				//capture feed_id and category_id from returned data
				var feed_id = data['feed_id'];
				var category_id = data['category_id'];

				//update statistics only in case when the status is returned as unread
				if (data['status'] == "unread") {

					//decrease unread count
					var unreadcount = $('div#status.panel a#unread.list-group-item span.badge').text();
					var unreadcountnew = unreadcount -1;
					$('div#status.panel a#unread.list-group-item span.badge').text(unreadcountnew);
					$('a#unread.navbar-brand span.badge.pull-right').text(unreadcountnew);

					//increase read count
					var readcount = $('div#status.panel a#read.list-group-item span.badge').text();
					var readcountnew = parseFloat(readcount)+1;
					$('div#status.panel a#read.list-group-item span.badge').text(readcountnew);

					//decrease count for main menu items
					var readcountmain = $('div#categories.panel').find('a#' + category_id).find('span.countunread').text();
					var readcountmainnew = readcountmain -1;
					$('div#categories.panel').find('a#' + category_id).find('span.countunread').text(readcountmainnew);

					//decrease count for sub menu items
					var readcountsub = $('div#categories.panel').find('a#' + feed_id).find('span.badge').text();
					var readcountsubnew = readcountsub -1;
					$('div#categories.panel').find('a#' + feed_id).find('span.badge').text(readcountsubnew);

				}
			},
			failure: function (errMsg) {}
		});

		//push the id from the article to the pool, so it will never be marked as read twice
		poolid.push(articleId);
	}
}

//used code from: http://www.inserthtml.com/2013/01/scroll-pagination/
//function for detailed scrolling and gathering data
(function ($) {

	$.fn.scrollPagination = function (options) {

		//default settings
		var settings = {
			nop: 10, // The number of posts per scroll to be loaded
			offset: 0, // Initial offset, begins at 10 in this case
			error: 'No More Posts - All items marked as read!', // When the user reaches the end this is the message that is
			delay: 100, // When you scroll down the posts will load after a delayed amount of time.
			scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
			category_id: '',
			feed_id: '',
			status: '',
			sort: '',
		}

		// Extend the options so they work with the plug-in
		if (options) {
			$.extend(settings, options);
		}

		// For each so that we keep chain-ability.
		return this.each(function () {

			// Some variables
			$this = $(this);
			$settings = settings;
			var offset = $settings.offset;
			var busy = false; // Checks if the scroll action is happening so we don't run it multiple times

			// Custom messages based on settings
			if ($settings.scroll == true) $initmessage = 'Scroll for more or click here';
			else $initmessage = 'Click for more';

			// Append custom messages and extra UI
			$this.append('<div class="content"></div><div class="info-bar" id="info-bar"><div style="width: 50%;"></div></div>');
			
			/* In the background new items might be loaded, therefore the unread, 
			read and star count is adjusted every time the article-list retrieved */			
			
			// Use json.php to get a status overview for read, unread and star counts
			$.ajax({
				type: "POST",
				url: "json.php",
				data: JSON.stringify({
					"jsonrpc": "2.0",
					"overview": "status"
				}),
				contentType: "application/json; charset=utf-8",
				dataType: "json",
				async: false,
				success: function (json) {
					
					//set unread count in navbar and sidebar menu
					$('div#status.panel a#unread.list-group-item span.badge').text(json["unread"]);
					$('a#unread.navbar-brand span.badge.pull-right').text(json["unread"]);
					
					//set star count in navbar and sidebar menu
					$('div#status.panel a#starred.list-group-item span.badge').text(json["starred"]);
					$('a#starred.navbar-brand span.badge.pull-right').text(json["starred"]);
					
					//read count is total minus unread
					ReadCount = json["total"] - json["unread"];
					$('div#status.panel a#read.list-group-item span.badge').text(ReadCount);	
				}
			});
			
			// Function for checking if a var is empty, null or undefined
			function isEmpty(str) {
				return (!str || 0 === str.length);
			}			

			// Use json.php to get a full list with article id's
			$.ajax({
				type: "POST",
				url: "json.php",
				data: JSON.stringify({
					"jsonrpc": "2.0",
					"request": "get-article-list",
					"status": $settings.status,
					"sort": $settings.sort,
					"feed_id": $settings.feed_id,
					"category_id": $settings.category_id
				}),
				contentType: "application/json; charset=utf-8",
				dataType: "json",
				async: false,
				success: function (json) {
					articleList = json;
				},
				failure: function (errMsg) {
					$("div#content").text("json.php failed to return content: " + errMsg)
				}
			});
			
			// On fist load, check if articleList is empty
			if (isEmpty(articleList)) {
				//Show message and set busy to true, avoid clicking and loading nothing
				$this.find('.info-bar').html('No posts available at first load.');
				busy = true;
			} else {			
				//Start loading first 10 articles
				getData(articleList.slice(0,10).join(",")); // Run function initially
				var articleCount = articleList.filter(function(value) { return value !== undefined }).length;
			}

			function getData(input) {
			
				console.log("get data for next " + offset + " items: " + input);

				// Post data to ajax.php, to wrap articles in html and append to content class
				$.post('ajax.php', {
					sort: $settings.sort,
					articlelist: input,
				}, function (data) {

					// Change loading bar content (it may have been altered)
					$this.find('.info-bar').html($initmessage);

					// If there is no data returned, there are no more posts to be shown. Show message and last mark items as read
					if (data == "") {
						$this.find('.info-bar').html($settings.error);
						
						// Capture previous nop and call FnReadPool function to mark remaining items as read
						for (var i = 0; i < articleList.slice(offset-$settings.nop-$settings.nop,articleCount).length; i++) {
							FnReadPool(articleList.slice(offset-$settings.nop-$settings.nop,articleCount)[i]);
						}						
						
					} else {

						// If data is returned, append the data to the content div
						$this.find('.content').append(data);

						// Add waypoint function to h3 header, look at FnReadPool
						$('div#block h4').waypoint(function() {
							var id = $(this).attr('id');
							FnReadPool(id);
						}, {
							// Triggered when the top of the h3 element hits 10px of top of the viewport
							offset: 10, triggerOnce: true 
						});

						// Increase offset
						offset = offset + $settings.nop;

						// No longer busy!
						busy = false;
					}
				});
			}

			// If scrolling is enabled
			if ($settings.scroll == true) {
				// .. and the user is scrolling

				//using on and off to avoid loading multiple instances
				$(window).on('scroll', function () {

					// Check the user is at the bottom of the element
					var scrollheight = $(window).scrollTop() + $(window).height();

					if (scrollheight > $this.height() && !busy) {

						console.log('maximum scrollheight reached, reloading getData');

						// Now we are working, so busy is true
						busy = true;

						// Tell the user we're loading posts
						$this.find('.info-bar').html('Loading Posts');

						// Run the function to fetch the data inside a delay
						// This is useful if you have content in a footer you
						// want the user to see.
						setTimeout(function () {
							getData(articleList.slice(offset-$settings.nop,offset).join(","));
						}, $settings.delay);

					}
				});
			}

			// When only a few items are loaded or minimal view is selected scrolling might not possible.
			$this.find('.info-bar').click(function () {
				if (busy == false) {
					busy = true;

					// Run the function to fetch the data inside a delay
					// This is useful if you have content in a footer you
					// want the user to see.
					setTimeout(function () {
						getData(articleList.slice(offset-$settings.nop,offset).join(","));
					}, $settings.delay);
				}

			});
		});
	}
})(jQuery);
