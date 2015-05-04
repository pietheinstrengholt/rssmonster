//sort stored in cookie
if (($.cookie('sort') == undefined)) {
	$.cookie('sort', 'desc', { expires: 14 });
}

//function to remove all spaces and non alphanumeric characters
function onlyalphanumeric(input) {
	var nospaces = input.replace(/\s+/g, '');
	var onlyalpha = nospaces.replace(/\W/g, '');
	return onlyalpha;
}

//set view type on load
$(document).ready(function () {
	if (($.cookie('view') == undefined)) {
		setview("detailed");
	} else {
		setview($.cookie('view'));
	}
});

//view type function
function setview(input) {
	var view = input;
	$.cookie('view', view, { expires: 14 });
	$("section").removeClass();
	$("section").addClass(view);
}

function removefeedbaroverflow() {
	$('feedbar').css({
		'overflow-y': 'hidden'
	});
}

//set variables immediately
var sort = $.cookie('sort');
var view = $.cookie('view');
var type = $.cookie('type');
var value = $.cookie('value');

//TODO: read window.location.hash and if set reload section with post parameters
$(document).ready(function () {

	//dropdown toggle
	$('.dropdown-toggle').dropdown();

	//remove scrollbar overflow
	removefeedbaroverflow();

	//if (request.length == 0) {
	if (($.cookie('type') == undefined) && ($.cookie('value') == undefined)) {
		$.cookie('type', 'status', { expires: 14 });
		$.cookie('value', 'unread', { expires: 14 });
	}

	loadcontent($.cookie('type'), $.cookie('value'), $.cookie('sort'), $.cookie('view'))

	//loaddetailedview function to load items when scrolling. Remember to use: $(window).off("scroll");
	function loadcontent(type, value, sort, view) {

	//empty poolid array
	poolid = [];

	//destroy waypoint functions, avoid many items being called, see infinite.js
	$('div#block h4').waypoint('destroy');

	//set category, feed and status variables
	if (type == 'category_id') { var category_id = value; }
	if (type == 'feed_id') { var feed_id = value; }
	if (type == 'status') { var status = value; }

	//remove content and offload scroll
	$('section').empty();
	$('section #content').remove();
	$('section').append('<div id="content"></div>');
	$(window).off("scroll");

	//use small amount of timeout when calling scrollPagination
	setTimeout(function () {
		$('#content').scrollPagination({
			nop: 1, // The number of posts per scroll to be loaded
			offset: 0, // Initial offset, begins at 0 in this case
			error: 'No More Posts - All items marked as read!', // When the user reaches the end this is the message that is
			delay: 100, // When you scroll down the posts will load after a delayed amount of time.
			scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
			category_id: category_id, // Catch category from menu
			feed_id: feed_id, // Catch feedname from menu
			status: status, // Catch status from menu
			sort: sort // Catch sort
			});
		}, 100);
	}

	//Functionality from menu when Articles section is clicked
	$("div#status.panel a.list-group-item").click(function () {

		//remove and add clicked status to class
		$('div#status.panel').find('.active').removeClass("active");
		$('div#categories.panel').find('.active').removeClass("active");
		$("div.menu-sub").hide();
		$(this).addClass("active");

		//load content
		var view = $.cookie('view');
		var status = $(this).find('span#title-name').text();
		var encoded_status = encodeURIComponent(status);
		$.cookie('type', 'status');
		$.cookie('value', encoded_status);
		loadcontent('status', $.cookie('value'), $.cookie('sort'), $.cookie('view'))

	});

	//Functionality when clicking on top-nav menu items
	$("a#starred.navbar-brand,a#unread.navbar-brand").click(function () {
		var status = $(this).attr('id');
		console.log(status);
		var encoded_status = encodeURIComponent(status);
		$.cookie('type', 'status');
		$.cookie('value', encoded_status);
		loadcontent('status', $.cookie('value'), $.cookie('sort'), $.cookie('view'))
	});

	//Category function on feedbar: Drop down menu sub-menu items when a category is clicked
	//hide sub menu by default
	$("div.menu-sub").hide();
	$("div#categories.panel a.list-group-item.main").click(function () {

		//avoid scrollbar
		removefeedbaroverflow();

		//remove any active clicked classes from status overview
		$('div#categories.panel').find('.active').removeClass("active");
		$('div#status.panel').find('.active').removeClass("active");
		$(this).addClass("active");

		//open submenu
		$(this).next("div.menu-sub").slideToggle(200);

		//remove and add active classes, needed for decreasing dynamic count
		$('div.feedbar').find('.active-sub').removeClass("active");

		//change styling and arrow
		if ($(this).hasClass("collapsed")) {
			$(this).removeClass("collapsed");
			$(this).find('span.glyphicon.glyphicon-chevron-down').attr('class', 'glyphicon glyphicon-chevron-right');
		} else {
			$(this).addClass("collapsed");
			$(this).find('span.glyphicon.glyphicon-chevron-right').attr('class', 'glyphicon glyphicon-chevron-down');
		}

		//load content
		var view = $.cookie('view');
		var category_id = $(this).attr('id');
		$.cookie('type', 'category_id');
		$.cookie('value', category_id);
		loadcontent('category_id', $.cookie('value'), $.cookie('sort'), $.cookie('view'))

	});

	//Functionality when sub menu item from categories is clicked
	$("div#categories.panel a.list-group-item.sub").click(function () {

		//remove any active clicked classes from status overview
		$('div#categories.panel').find('.active').removeClass("active");
		$(this).addClass("active");

		//load content
		var view = $.cookie('view');
		var feed_id = $(this).attr('id');
		$.cookie('type', 'feed_id');
		$.cookie('value', feed_id);
		loadcontent('feed_id', $.cookie('value'), $.cookie('sort'), $.cookie('view'))
	});

	//Set viewtype (list, detailed or minimal) button from topnav menu
	$("a.view-type").click(function () {
		var viewtype = $(this).attr("id");
		setview(viewtype);
	});

	//Sort button from topnav menu
	$("a.sort-order").click(function () {
		var sortorder = $(this).attr("id");
		$.cookie('sort', sortorder, { expires: 14 });
		loadcontent($.cookie('type'), $.cookie('value'), $.cookie('sort'), $.cookie('view'))
	});

	//Load opml import screen in section
	$("a#import-opml").click(function () {
		$(window).off("scroll");
		$('section').load('opml.php');
	});

	//Load opml import screen in section
	$("a.update").click(function () {
		//show progress bar while loading
		console.log("update feeds initialized");
		$(window).off("scroll");
		$('section').empty();
		$('section').load('update.php');
	});

	//Load organize feeds section
	$("div.organize button.btn.btn-small.btn-primary").click(function () {
		$(window).off("scroll");
		$('section').load('manage-feeds.php');
	});

	//Load organize feeds section
	$("div.organize button.btn.btn-small.btn-warning").click(function () {
		console.log("mark-as-read button clicked");
		$.ajax({
			type: "POST",
			url: "json.php",
			data: JSON.stringify({
				"jsonrpc": "2.0",
				"update": "mark-as-read"
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

	//todo: show read and unread bottons
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
			console.log('starred item: ' + $(this).attr('id'));
		} else {
			$(this).removeClass("star");
			$(this).addClass("unstar");
			var starmark = "unmark";
			var starredcountnew = parseFloat(starredcount)-1;
			console.log('unstarred item: ' + $(this).attr('id'));		
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
		$('div#status.panel a#starred.list-group-item span.badge').text(starredcountnew);
		$('a#starred.navbar-brand span.badge.pull-right').text(starredcountnew);
	});

});

//pool for mark as read
var poolid = new Array();

//function to mark items as read and to avoid items are set to read more then once
function FnReadPool(input) {
	if (jQuery.inArray(input, poolid) == -1) {

		setTimeout(function() {
			console.log("viewport:" + input);
		}, 600);

		$.ajax({
			type: "POST",
			url: "json.php",
			data: JSON.stringify({
				"jsonrpc": "2.0",
				"update": "item-as-read",
				"value": input
			}),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
			success: function (data) {

				//capture feed and status, filter out non alphanumeric and white spaces
				var feed_id = onlyalphanumeric(data[0]['feed_id']);
				var category_id = onlyalphanumeric(data[0]['category_id']);

				//only in case when status is unread
				if (data[0]['status'] == "unread") {

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

					//decrease count for last 24 hours
					if (data[0]['publish_date'] == "last-24-hours") {
						var tfcount = $('div#status.panel a#last-24-hours.list-group-item span.badge').text();
						var tfcountnew = tfcount -1;
						$('div#status.panel a#last-24-hours.list-group-item span.badge').text(tfcountnew);
					}

					//decrease count for last 24 hours and last hour
					if (data[0]['publish_date'] == "last-hour") {
						var lastcount = $('div#status.panel a#last-hour.list-group-item span.badge').text();
						var lastcountnew = lastcount -1;
						$('div#status.panel a#last-hour.list-group-item span.badge').text(lastcountnew);

						var tfcount = $('div#status.panel a#last-24-hours.list-group-item span.badge').text();
						var tfcountnew = tfcount -1;
						$('div#status.panel a#last-24-hours.list-group-item span.badge').text(tfcountnew);
					}
				}
			},
			failure: function (errMsg) {}
		});

		//push the id from the article to the pool, so it will never be marked as read twice
		poolid.push(input);
	}
}

//reference: http://www.inserthtml.com/2013/01/scroll-pagination/
//function for detailed scrolling and gathering data
(function ($) {

	$.fn.scrollPagination = function (options) {

		//default settings
		var settings = {
			nop: 1, // The number of posts per scroll to be loaded
			offset: 0, // Initial offset, begins at 0 in this case
			error: 'No More Posts!', // When the user reaches the end this is the message that is
			delay: 100, // When you scroll down the posts will load after a delayed amount of time.
			scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
			category_id: '',
			feed_id: '',
			status: '',
			sort: '',
		}

		//set result
		var result = [];

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
					result = json;
				},
				failure: function (errMsg) {
				}
			});

			function getData(input) {

				// Post data to backend.php
				$.post('backend.php', {
					sort: $settings.sort,
					articlelist: input,
				}, function (data) {

					// Change loading bar content (it may have been altered)
					$this.find('.info-bar').html($initmessage);

					// If there is no data returned, there are no more posts to be shown. Show message
					if (data == "") {
						$this.find('.info-bar').html($settings.error);
					} else {

						// If data is returned, append the data to the content div
						$this.find('.content').append(data);

						//add waypoint function to h3 header, look at FnReadPool
						$('div#block h4').waypoint(function() {
							var id = $(this).attr('id');
							FnReadPool(id);
						}, {
							offset: 10, triggerOnce: true 
						});

						// Offset increases
						offset = offset + $settings.nop;

						// No longer busy!
						busy = false;
					}
				});
			}

			function processpool() {

				// Run the function to fetch the data inside a delay
				// This is useful if you have content in a footer you
				// want the user to see.
				setTimeout(function () {

					//mark remaining items as read
					if( result[offset] === undefined ) {
						console.log("pool with id's is empty, mark last items in batch as read: " + result[offset-1].join(","));

						for (var i = 0; i < result[offset-1].length; i++) {
							FnReadPool(result[offset-1][i]);
						}

						$this.find('.info-bar').html('No more posts available');

					} else {
						console.log("get data for batch:" + offset + " items: " + result[offset].join(","));
						getData(result[offset].join(","));
					}
				}, $settings.delay);
			}


			// On fist load
			if (result[0] === undefined ) {
				console.log("No posts found on first load");
				$this.find('.info-bar').html('No posts available, all marked as read');
			} else {
				console.log("get data on load: " + result[0].join(","));
				getData(result[0].join(",")); // Run function initially
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

						// Process the article pool
						processpool();

					}
				});
			}

			// When only a few items are loaded or minimal view is selected scrolling might not possible.
			$this.find('.info-bar').click(function () {
				if (busy == false) {
					busy = true;

					// Process the article pool
					processpool();
				}

			});
		});
	}
})(jQuery);
