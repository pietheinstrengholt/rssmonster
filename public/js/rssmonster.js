
//create new object to store selection
var mySelection = new Object();
mySelection.status = "unread";
mySelection.sort = "desc";
mySelection.view = "detailed";
mySelection.category_id = null;
mySelection.feed_id = null;
mySelection.loadcount = 0;

//Run loadcontent function only once page is fully loaded
$(document).ready(function () {

	//Use api to deploy the sidebar, the sidebar is only deployed once and will be updated when used.
	$.ajax({
		type: "GET",
		url: "index.php/api/category/overview",
		async: false,
		success: function (json) {

			//set unread count in navbar and sidebar menu
			$('div.panel').empty();
			$('div.panel').append('<ul id="all" class="connected"><li class="list-group-item main all" draggable="false"><span class="glyphicon glyphicon-tree-deciduous" aria-hidden="true"></span> All<span class="badge"></span></li></ul>');
			$.each(json, function(key, category) {
				$('div.panel').append('<ul id="' + category["id"] + '" class="connected main"><li id="' + category["id"] + '" class="list-group-item main" draggable="false"><span class="glyphicon glyphicon-folder-close" aria-hidden="true"></span><span class="title">' + category["name"] + '</span><span class="badge">' + category["unread_count"] + '</span></li><li class="list-group-item wrapper" draggable="false"></li>');
				//check if feeds object is not empty
				if (category["feeds"]) {
					$.each(category["feeds"], function(feedkey, feed) {
					
						//check if favicon is null, else default with rss-default image
						if (feed["favicon"] == null) {
							favicon = "img/rss-default.png";
						} else {
							favicon = feed["favicon"];
						}

						$('div.panel ul#' + category["id"] + '.main').append('<li class="list-group-item item" draggable="true" id="' + feed["id"] + '"><img class="favicon" src="' + favicon + '" onError="this.onerror=null;this.src=\'img/rss-default.gif\'"></img><span class="title">' + feed["feed_name"] + '</span><span class="badge">' + feed["unread_count"] + '</span></li>');
					});
				}
			});
		
		},
		failure: function (errMsg) {
			//set error message, no categories and feeds retrieved
			$('div#categories.panel').empty();
			$('div#categories.panel').append('<p style="margin-left:3px;">No categories and feeds found, use the top menu to add new RSS feeds!<p>');					
		}
	});

	//dropdown toggle
	$('.dropdown-toggle').dropdown();
	
	//hide wrapper and sub items on first load
	$("li.list-group-item.item,li.list-group-item.wrapper").hide();

	//first load of content
	loadcontent();

	//loaddetailedview function to load items when scrolling. Remember to use: $(window).off("scroll");
	function loadcontent() {
	
		//increase load count
		mySelection.loadcount++;
		
		if (mySelection.loadcount == 1) {
			$('ul#all li').addClass("collapsed");
		}
	
		//highlight the button in the sidebar with corresponding status
		$('div#buttons-top').find('button').removeClass("btn-primary").addClass("btn-default");
		$("div#buttons-top button#" + mySelection["status"]).removeClass("btn-default");
		$("div#buttons-top button#" + mySelection["status"]).addClass("btn-primary");		
	
		//set view type
		$("section").removeClass();
		$("section").addClass(mySelection["view"]);

		//empty poolid and articleList array's
		poolid = [];
		articleList = [];

		//destroy waypoint functions, avoid many items being called, see infinite.js
		$('div#block h4').waypoint('destroy');

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
				category_id: mySelection["category_id"], // Catch category from menu
				feed_id: mySelection["feed_id"], // Catch feedname from menu
				status: mySelection["status"], // Catch status from menu
				sort: mySelection["sort"] // Catch sort
			});
		}, 100);
	}

	//Functionality when clicking on top-nav menu items or buttons in the sidebar
	$("a#star.navbar-brand,a#unread.navbar-brand,div#buttons-top button#unread, div#buttons-top button#read, div#buttons-top button#star").click(function () {
		mySelection.status = encodeURIComponent($(this).attr('id'));
		loadcontent();
	});
	

	//Functionality when clicking on main menu items in the sidebar
	//Change the glyphicon (folder open or closed) and hide or show the sub menu items
	$("div.panel").on("click", "li.list-group-item.main", function (event) {
	
		//get parentId
		var parentId = $(this).parent().attr("id");

		//if the already collapsed menu is selected again inverse and empty category and feed
		if ($(this).hasClass("collapsed")) {
			$(this).removeClass("collapsed");
			$("ul#" + parentId + " li.list-group-item.item" ).hide();
			$("ul#" + parentId + " li.list-group-item.wrapper").hide();
			$("ul#" + parentId + " li.list-group-item.main span.glyphicon").removeClass("glyphicon-folder-open");
			$("ul#" + parentId + " li.list-group-item.main span.glyphicon").addClass("glyphicon-folder-close");
			mySelection.category_id = null;	
			mySelection.feed_id = null;			
			$("ul#all li.main").addClass("collapsed");
			//remove classes from any active sub items
			$('div.panel').find('.list-group-item-warning').removeClass("list-group-item-warning");
		} else {
			$('div.panel').find('li.list-group-item.main').removeClass("collapsed");
			$(this).addClass("collapsed");
			$("ul#" + parentId + " li.list-group-item.item" ).show();
			$("ul#" + parentId + " li.list-group-item.wrapper").show();
			$("ul#" + parentId + " li.list-group-item.main span.glyphicon").removeClass("glyphicon-folder-close");
			$("ul#" + parentId + " li.list-group-item.main span.glyphicon").addClass("glyphicon-folder-open");			
			mySelection.category_id = $(this).attr('id');
			mySelection.feed_id = null;
			//remove classes from any active sub items
			$('div.panel').find('.list-group-item-warning').removeClass("list-group-item-warning");
		}
		
		loadcontent();

	});	

	//Functionality when sub menu item from categories are clicked
	$("div.panel").on("click", "li.list-group-item.item", function (event) {
		//remove any list-group-item-warning classes from status overview
		$('div.panel').find('.list-group-item-warning').removeClass("list-group-item-warning");
		$(this).addClass("list-group-item-warning");
		mySelection.feed_id = $(this).attr('id');
		loadcontent();
	});

	//Functionality to change the viewtype (list, detailed or minimal), clicked on top-nav menu
	$("a.view-type").click(function () {
		mySelection.view = $(this).attr("id");
		loadcontent();
	});

	//Functionality to change the sort order, clicked on top-nav menu
	$("a.sort-order").click(function () {
		mySelection.sort = $(this).attr("id");
		loadcontent();
	});

	//Functionality to update all feeds, fetch new articles from RSS feeds
	$("a.update").click(function () {
		//TODO: show progress bar while loading
		$(window).off("scroll");
		$('section').empty();
		$('section').load('index.php/api/feed/updateall');
	});
	
	//Functionality to load manage feeds screen
	$("a.managefeeds").click(function () {
		$(window).off("scroll");
		$('section').empty();
		$('section').load('index.php/managefeeds');
	});	

	//Functionality to show modal pop-up, change modal text based on button property
	$("button#mark-as-read").click(function () {
		$('#modal').modal('show');
		$('#modal div.modal-header h4.modal-title').text('Mark as read dialog');
		$('#modal div.modal-content div.modal-body').empty();
		$('#modal div.modal-content div.modal-body').append('<p></p>');		
		$('#modal div.modal-content div.modal-body p').text('Are you sure you want to mark all articles as read?');
		$('#modal div.modal-content div.modal-footer button.btn-primary').text('Yes');
		$('#modal div.modal-content div.modal-footer button.btn-primary').attr('id', 'modal-mark-as-read');
	});
	
	//Functionality to mark all items as read (except star items), when clicked on modal button
	$("#modal").on("click", "button#modal-mark-as-read", function(event){
		$.ajax({
			type: "POST",
			url: "index.php/api/article/mark-all-as-read",
			data: {
				"update": "mark-all-as-read"
			},
			async: false,
			success: function (json) {
				result = json;
				$('#modal').modal('hide');
				//scroll to top before refresh
				document.body.scrollTop = document.documentElement.scrollTop = 0;
				//refresh the page
				location.reload();
			},
			failure: function (errMsg) {}
		});
	});	
	
	//Functionality to show modal pop-up, change modal text based on button property
	$("button#delete").click(function () {
		
		category_title = $("li.main.collapsed span.title").text();
		feed_title = $("li.item.list-group-item-warning span.title").text();

		if (mySelection.feed_id == null && !!mySelection.category_id) {
			$('#modal').modal('show');
			$('#modal div.modal-content div.modal-body').empty();
			$('#modal div.modal-content div.modal-body').append('<p></p>');
			$('#modal div.modal-content div.modal-body p').text('Are you sure you want to delete the following category "' + category_title + '"?');
			$('#modal div.modal-header h4.modal-title').text('Delete current selected category');		
		} else if (!!mySelection.feed_id && !!mySelection.category_id) {
			$('#modal').modal('show');
			$('#modal div.modal-content div.modal-body').empty();
			$('#modal div.modal-content div.modal-body').append('<p></p>');
			$('#modal div.modal-content div.modal-body p').text('Are you sure you want to delete the following feed "' + feed_title + '"?');
			$('#modal div.modal-header h4.modal-title').text('Delete current selected feed');
		}
		
		$('#modal div.modal-content div.modal-footer button.btn-primary').text('Yes');
		$('#modal div.modal-content div.modal-footer button.btn-primary').attr('id', 'modal-delete');		

	});	
	
	//Functionality to mark all items as read (except star items), when clicked on modal button
	$("#modal").on("click", "button#modal-delete", function(event){
		if (mySelection.feed_id == null && !!mySelection.category_id) {
			$.ajax({
				type: "DELETE",
				url: "index.php/api/category/" + mySelection.category_id,
				async: false,
				success: function (json) {
					$('#modal').modal('hide');
					//scroll to top before refresh
					document.body.scrollTop = document.documentElement.scrollTop = 0;
					//refresh the page
					location.reload();
				},
				failure: function (errMsg) {}
			});		
		} else if (!!mySelection.feed_id && !!mySelection.category_id) {
			$.ajax({
				type: "DELETE",
				url: "index.php/api/feed/" + mySelection.feed_id,
				async: false,
				success: function (json) {
					$('#modal').modal('hide');
					//scroll to top before refresh
					document.body.scrollTop = document.documentElement.scrollTop = 0;
					//refresh the page
					location.reload();
				},
				failure: function (errMsg) {}
			});			
		}
	});
	
	//Functionality to show modal pop-up, change modal text based on button property
	$("button#new").click(function () {
		$('#modal').modal('show');
		$('#modal div.modal-header h4.modal-title').text('Add new category');
		$('#modal div.modal-content div.modal-body').empty();
		$('#modal div.modal-content div.modal-body').append('<div class="form-group"><label for="exampleInputEmail1">Enter new name</label><input type="category" class="form-control" id="category" placeholder="Category"></div>');
		$('#modal div.modal-content div.modal-footer button.btn-primary').text('Submit');
		$('#modal div.modal-content div.modal-footer button.btn-primary').attr('id', 'add-new-category');
	});
	
	//Functionality to mark all items as read (except star items), when clicked on modal button
	$("#modal").on("click", "button#add-new-category", function(event) {
	
		new_category_name = $("div.modal-body input#category").val();

		
		if (!(new_category_name == null || new_category_name=='')) {
			$.ajax({
				type: "POST",
				url: "index.php/api/category",
				data: {
					"name": new_category_name
				},
				async: false,
				success: function (json) {
					$('#modal').modal('hide');
					//scroll to top before refresh
					document.body.scrollTop = document.documentElement.scrollTop = 0;
					//refresh the page
					location.reload();
				},
				failure: function (errMsg) {}
			});	
		}
	});	

	//event when starring or un-staring item
	$("body").on("click", "div.item-star", function (event) {
		
		//get article id
		var id = $(this).attr('id');
	
		//remove classes, set new count and variables
		if ($(this).hasClass("unstar")) {
			$(this).removeClass("unstar");
			$(this).addClass("star");
			var starmark = "mark";
		} else {
			$(this).removeClass("star");
			$(this).addClass("unstar");
			var starmark = "unmark";
		}
		
		//send json request
		$.ajax({
			type: "POST",
			url: "index.php/api/article/mark-with-star/" + id,
			data: {
				"update": starmark
			},
			async: false,
			success: function (json) {
				result = json;
			},
			failure: function (errMsg) {}
		});

	});
	

	$("body").on("click", "button#submit-feedchanges", function (event) {
		
		//restructure array form data
		var values = {};
		$.each($('form.form-inline').serializeArray(), function(i, field) {
			values[field.name] = field.value;
		});
		
		//send json request
		$.ajax({
			type: "POST",
			url: "index.php/api/feed/changeall",
			data: {
				"feeds": values
			},
			async: false,
			success: function (json) {
				result = json;
				console.log(result);
				if (result = "done") {
					location.reload();
				}
			},
			failure: function (errMsg) {
				console.log(errMsg);
			}
		});		
		
    });

});

//Function to make the main menu items sortable in the sidebar
$(function() {
	$('div.panel').sortable({
		items: "> ul.main",
		containment: "parent" ,
		axis: "y",
		
		stop: function(event, ui) {
			//create new empty array to store new sortorder
			var orderArray = new Array();

			$("ul.main").each(function(i, el){
				var category_id = $(el).attr("id");
				sortorder = $(el).index();
				orderArray[sortorder] = category_id;
				
			});
			
			$.ajax({
				type: "POST",
				url: "index.php/api/category/updateorder",
				data: {
					"order": orderArray
				},
				success: function (data) {
					//console.log("order updated");
				},
				failure: function (errMsg) {}
			});			
		}
	});
});

//Function to make the sub menu items sortable between the main menu items
$(function() {
	$('ul.connected').sortable({
		items: "> li.item",
		connectWith: '.connected',
		axis: "y",
		opacity: 0.8,
		receive: function(event, ui) {
			var category_id = this.id;
			$.ajax({
				type: "POST",
				url: "index.php/api/feed/changecategory",
				data: {
					"feed_id": ui.item.attr("id"),
					"category_id": category_id
				},
				success: function (data) {
					//console.log("[" + category_id + "] received [" + ui.item.attr("id") + "] from [" + ui.sender.attr("id") + "]");
				},
				failure: function (errMsg) {}
			});

		}
	});
	
});

//Create pool array to remember which items are marked as read
var poolid = new Array();

//Pool function to mark items as read and to avoid items are set to read more then once
function FnReadPool(articleId) {

	//check if articleId is already in the Pool
	if (jQuery.inArray(articleId, poolid) == -1) {

		setTimeout(function() {
			//console.log("viewport:" + articleId);
		}, 300);

		$.ajax({
			type: "POST",
			url: "index.php/api/article/mark-to-read/" + articleId,
			success: function (data) {

				//capture feed_id and category_id from returned data
				var feed_id = data['feed_id'];
				var category_id = data['category_id'];

				//update statistics only in case when the status is returned as read
				if (data['status'] == "read") {

					//decrease unread count
					var unreadcount = $('a#unread.navbar-brand span.badge.pull-right').text();
					var unreadcountnew = unreadcount -1;
					$('div.panel ul#all span.badge').text(unreadcountnew);
					$('a#unread.navbar-brand span.badge.pull-right').text(unreadcountnew);

					//increase read count
					//var readcount = $('div.panel a#read.list-group-item span.badge').text();
					//var readcountnew = parseFloat(readcount)+1;
					//$('div.panel a#read.list-group-item span.badge').text(readcountnew);
					
					//decrease count for main menu items
					var readcountmain = $('div.panel').find('li#' + category_id + '.list-group-item.main').find('span.badge').text();
					var readcountmainnew = readcountmain -1;
					$('div.panel').find('li#' + category_id + '.list-group-item.main').find('span.badge').text(readcountmainnew);

					//decrease count for sub menu items
					var readcountsub = $('div.panel').find('li#' + feed_id + '.list-group-item.item').find('span.badge').text();
					var readcountsubnew = readcountsub -1;
					$('div.panel').find('li#' + feed_id + '.list-group-item.item').find('span.badge').text(readcountsubnew);

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
			status: 'unread',
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
			
			// Use api to get a status overview for read, unread and star counts
			$.ajax({
				type: "GET",
				url: "index.php/api/article/overview",
				async: true,
				success: function (json) {
					//set unread count in navbar and sidebar menu
					$('div.panel ul#all span.badge, a#unread.navbar-brand span.badge.pull-right').text(json["unread"]);
					
					//set star count in navbar and sidebar menu
					//$('div#status.panel a#star.list-group-item span.badge').text(json["star"]);
					$('a#star.navbar-brand span.badge.pull-right').text(json["star"]);
					
					//read count is total minus unread
					//ReadCount = json["total"] - json["unread"];
					//$('div#status.panel a#read.list-group-item span.badge').text(ReadCount);	
				}
			});

			//on the first initial load the sidebar is already deployed. Do not call the overview twice.
			if (mySelection.loadcount > 1) {
			
				// Use api to get an overview of all items in sidebar
				$.ajax({
					type: "GET",
					url: "index.php/api/category/overview",
					contentType: "application/json; charset=utf-8",
					dataType: "json",
					async: true,
					success: function (json) {
					
						//set count in sidebar menu for categories and feed items
						$.each(json, function(key, category) {
							$('div.panel li#' + category["id"] + '.list-group-item.main span.badge').text(category["unread_count"]);
							if (category["feeds"]) {
								$.each(category["feeds"], function(feedkey, feed) {
									$('div.panel li#' + feed["id"] + '.list-group-item.item span.badge').text(feed["unread_count"]);
								});
							}
						});
					},
					failure: function (errMsg) {
						//set error message, no categories and feeds retrieved
						$('div.panel').empty();
						$('div.panel').append('<p style="margin-left:3px;">No categories and feeds found, use the top menu to add new RSS feeds!<p>');					
					}
				});
			}

			// Use api to get a full list with article id's, based on given arguments
			$.ajax({
				type: "GET",
				url: "index.php/api/article/listing",
				data: {
					"status": $settings.status,
					"feed_id": $settings.feed_id,
					"category_id": $settings.category_id,
					"sort": $settings.sort
				},
				async: false,
				success: function (json) {
					articleList = json;
				},
				failure: function (errMsg) {
					$("div#content").text("json.php failed to return content: " + errMsg)
				}
			});

			// Function for checking if a var is empty, null or undefined
			function isEmpty(str) {
				return (!str || 0 === str.length);
			}
			
			// If articleList is empty, show no post available, else load first 10 items
			if (isEmpty(articleList)) {
				//Show message and set busy to true, avoid clicking and loading nothing
				$this.find('.info-bar').html('No posts available at first load.');
				busy = true;
			} else {
				//Start loading first 10 articles by using the getData function
				getData(articleList.slice(0,10).join(",")); // Run function initially
				var articleCount = articleList.filter(function(value) { return value !== undefined }).length;
			}

			//getData function to retrieve article content
			function getData(input) {
			
				//If input is empty, show no post available message and mark all items as read
				if (isEmpty(input)) {
					$('.info-bar').html($settings.error);
					//capture previous nop and call FnReadPool function to mark remaining items in the pool as read
					for (var i = 0; i < articleList.slice(offset-$settings.nop-$settings.nop,articleCount).length; i++) {
						FnReadPool(articleList.slice(offset-$settings.nop-$settings.nop,articleCount)[i]);
					}
				} else {
			
					//Post data to api, articles are wrapped in html and appended to content class
					$.ajax({
						type: "GET",
						url: "index.php/api/article/details",
						data: {
							"sort": $settings.sort,
							"article_id": input
						},
						async: true,
						success: function (data) {

							// Change loading bar content (it may have been altered)
							$this.find('.info-bar').html($initmessage);

							// Add data to content
							if (data) {
							
								// If data is returned, append the data to the content div
								$.each(data, function(key, article) {
									
									if (article["status"] == 'star') {
										var starflag = "star";
									} else {
										var starflag = "unstar";								
									}
									
									//TODO: add difference timeinterval, lesscontent (250 character block), author 
									$this.find('.content').append('<div id="block"><div class="article" id="' + article["id"] + '"><div class="item-star ' + starflag + '" id=' + article["id"] + '></div><h4 class="heading" id="' + article["id"] + '"><a href="' + article["url"] + '" target="_blank">' + article["subject"] + '</a></h4><div class="feedname">' + article["feed_name"] + ' | ' + article["published"] + '</div><div class="minimal" id=' + article["id"] + '><span class="feedname">' + article["feed_name"] + '</span><span class="heading"><a href="' + article["url"] + '" target="_blank"> - ' + article["subject"] + '</a></span><span class="publishdate">' + article["publish_date"] + '</span></div><hr><div class="page-content">' + article["content"] + '</div><div class="less-content">' + article["content"] + '</div></div></div>');
								});

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

							// If there is no data returned, there are no more posts to be shown. Show message and last mark items as read
							} else {

								$this.find('.info-bar').html($settings.error);
								
								// Capture previous nop and call FnReadPool function to mark remaining items as read
								for (var i = 0; i < articleList.slice(offset-$settings.nop-$settings.nop,articleCount).length; i++) {
									FnReadPool(articleList.slice(offset-$settings.nop-$settings.nop,articleCount)[i]);
								}
							}
						},
					});
				}
			}

			// If scrolling is enabled
			if ($settings.scroll == true) {
				// .. and the user is scrolling

				//using on and off to avoid loading multiple instances
				$(window).on('scroll', function () {

					// Check the user is at the bottom of the element
					var scrollheight = $(window).scrollTop() + $(window).height();

					if (scrollheight > $this.height() && !busy) {

						//console.log('maximum scrollheight reached, reloading getData');

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

			// When only a few items are loaded or minimal view is selected scrolling might not possible, therefor the info has a click function to mark all items
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
