<template>
	<div id="main">
		<div class="subscribe-toolbar">
			<div class="status-toolbar" @click="toggleShowStatus">
				<p id="status">{{ this.$store.data.status | capitalize }}</p>
			</div>
			<div v-if='showStatusMenu' class="dropdownmenu" id="status">
				<div class="item" href="#" @click="statusClicked('unread')"><p>Unread</p></div>
				<div class="item" href="#" @click="statusClicked('read')"><p>Read</p></div>
				<div class="item" href="#" @click="statusClicked('star')"><p>Star</p></div>
			</div>
			<div class="status-toolbar" @click="toggleShowFilter">
				<p id="filter">{{ this.$store.data.filter | capitalize }}</p>
			</div>
			<div v-if='showFilterMenu' class="dropdownmenu" id="filter">
				<div class="item" href="#" @click="filterClicked('full')"><p>Full</p></div>
				<div class="item" href="#" @click="filterClicked('minimal')"><p>Minimal</p></div>
			</div>
			<form class="new-form-wrap" data-behavior="search_form" accept-charset="UTF-8" data-remote="true" method="post" role="url">
				<input @keyup="emitSearchEvent()" v-model="search" type="text" class="query" placeholder="Search" autocomplete="off">
			</form>
		</div>
		<div id="articles">
			<div v-bind:id="article.id" class="block" v-for="(article, key) in articles">
				<div class="article">
					<div class="maximal">
						<div v-bind:class="{'bookmarked': article.star_ind == 1}" v-on:click="bookmark(article.id, $event)" @click="$event.target.classList.toggle('bookmarked')" class="bookmark">
						</div>
						<h5 class="heading">
							<a target="_blank" :href="article.url" v-text="article.subject"></a>
						</h5>
						<div class="feedname">
							<span class="favicon">
								<img class="favicon" :src="article.favicon" onerror="this.onerror=null;this.parentNode.removeChild(this);">
							</span>
							<span class="feed_name" v-text="article.feed_name"></span>
							<span class="break"> | </span>
							<span class="published_date" v-text="article.published"></span>
						</div>
					</div>

					<div v-if="$store.data.filter === 'full'" class="article-content" v-html="article.content">
					</div>
					<div v-if="$store.data.filter === 'minimal'" class="article-content">
						<p>{{ article.content | stripHTML }}</p>
					</div>
				</div>
			</div>
			<infinite-loading @infinite="onInfinite" ref="infiniteLoading">
				<span slot="no-more">
					No More Posts - All items marked as read!
				</span>
			</infinite-loading>
		</div>
	</div>
</template>

<style>

/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
	div.subscribe-toolbar {
		display: none;
	}

	div#articles {
		padding-top: 0px !important;
	}
}

div.block {
	margin-bottom: 0px;
	padding-top: 5px;
}

div.block .article {
	padding-top: 4px;
	padding-left: 5px;
	padding-right: 5px;
	border-color: #E0E0E0;
	border-width: 1px;
}

div.block .article {
	border-bottom: 1px solid #E0E0E0;
}

div.block .article h4 {
	cursor: pointer;
	margin-top: 5px;
}

div.block div.article-content {
	margin-bottom: 10px;
}

div.block .article h4 a {
	color: #333333;
}

div.block div.feedname {
	color: #696969;
}

div.block div.article-content {
	color: #333344;
}

div.block .article h5 a {
	color: #333333;
	font-weight: 400;
}

div.block div.article hr {
	margin-top: 3px;
	margin-left: 5px;
	width: 98%;
}

div.block div.feedname {
	margin-top: -8px ! important;
	font-size: 12px;
	padding-top: 4px;
	padding-left: 0px;
	font-weight: bold;
}

div.block div.article-block hr {
	margin-top: 3px;
	margin-left: 5px;
	width: 180px;
}

div.block div.article hr {
	border-top: 1px solid #D3D3D3;
}

div.block .active {
	background-color: #ffffe5;
}

div.block div.article-content {
	margin-top: 1px;
	margin-left: 0px;
}

div.block div.bookmark,
div.block div.bookmarked {
	height: 29px;
	background-repeat: no-repeat;
	float: left;
	width: 32px;
	margin-top: -8px;
	margin-left: -6px;
	cursor: pointer;
	background-size: 18px 18px;
	background-position: 8px 12px;
	color:#111;
}

div.block div.bookmark {
	background-image: url('http://localhost/rssmonster/public/img/heart_unselected.png');
}

div.block div.bookmarked {
	background-image: url('http://localhost/rssmonster/public/img/heart_selected.png');
}

div.block div.article-content img {
	max-width: 100%;
	height: auto;
}

div.block span.favicon img.favicon {
	margin-right: 5px;
	height: 18px;
	width: 18px;
	margin-top: -1px;
}

div.subscribe-toolbar {
	height: 40px;
	border-bottom: 1px solid transparent;
	border-color: #dcdee0;
	position: absolute;
	width: 100%;
	overflow: hidden;
    background-color: #eff1f3;
	position: fixed;
	margin-left: -18px;
}

div#newfeed {
    height: 100%;
    width: 20%;
    float: left;
    text-align: center;
    border-right: 1px solid black;
    border-color: #dcdee0;
}

form.new-form-wrap {
    width: 80%;
    float: left;
}

.query {
    width: 100%;
    color: #3399FF;
    height: 39px;
    margin: 0;
    padding: 4px 0px 3px 28px;
    font-size: 14px;
    background-color: #eff1f3;
    border: none;
    line-height: 1;
    color: #212325;
    background: url(http://localhost/rssmonster/public/img/search.svg) 8px 13px no-repeat;
}

div#show-modal {
    height: 100%;
}

div#articles {
	padding-top: 40px;
}

div.status-toolbar {
	float: left;
    border-right: 1px solid #E0E0E0;
    margin-left: 10px;
	text-align: center;
	cursor: pointer;
	color: #111;
}

div.status-toolbar p {
	padding: 4px;
    font-size: 14px;
    margin-right: 12px;
    margin-top: 5px;
}

div.dropdownmenu {
	position: fixed;
    margin-top: 40px;
    background-color: #eff1f3;
	cursor: pointer;
	box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
    min-width: 100px;
	color: #111;
}

div.dropdownmenu div.item {
    border-bottom: 1px solid #E0E0E0;
    border-right: 1px solid #E0E0E0;
    border-left: 1px solid #E0E0E0;
	padding:4px;
	cursor: pointer;
}

div.dropdownmenu div.item p {
	margin-left: 10px;
	margin-right: 10px;
	margin-bottom: 0px;
	font-weight: 400;
    font-size: 14px;
}

div.status-toolbar p#status {
	width:50px;
}

div.status-toolbar p#filter {
	width:50px;
}

div#filter.dropdownmenu {
	margin-left: 72px;
}

</style>

<script>
import InfiniteLoading from 'vue-infinite-loading';
require('waypoints/lib/noframework.waypoints.js');

export default {
	data() {
		return {
			distance: 0,
			isActive: false,
			articles: [],
			container: [],
			pool: [],
			waypointPool: [],
			search: null,
			showStatusMenu: false,
			showFilterMenu: false,
		}
	},
	store: {
		data: 'data',
		categories: 'categories'
	},
	//watch the data store, when changing reload the article details
    watch: {
		'$store.data': {
			handler: function(data) {
				this.$http.get('articles/listing', {
					params: {
						//the following arguments are used
						status: data.status,
						category_id: data.category,
						feed_id: data.feed,
						search: data.search
					},
					}).then(response => {
						return response.json();
					})
					.then(data => {
						//reset the pool, attach data to container and get first set of article details
						this.resetPool();
						this.container = data;
						this.getArticleDetails();
					});
			},
			deep: true
		}
    },
	components: {
		InfiniteLoading,
	},
	beforeCreate() {
		this.$http.get('articles/listing?status=unread')
			.then(response => {
				return response.json();
			})
			.then(data => {
				this.container = data;
			});
	},
	methods: {
		onInfinite() {
			setTimeout(() => {
				//call getArticleDetails
				this.getArticleDetails();
			}, 200);
		},
		flushPool() {
			//check if the container is present
			if (this.container.length) {
				//loop through the container and mark every item that is not part of the pool as read
				for (var i in this.container) {
					if (!this.pool.includes(this.container[i])) {
						this.markArticleRead(this.container[i]);
					}
				}
			}
		},
		resetPool() {
			//reset the articles, container and distance
			this.articles = [];
			this.container = [];
			this.distance = 0;
		},
		getArticleDetails() {
			//check the container size
			if ((this.container.slice(this.distance, this.distance + 20)).length == 0) {
				this.$refs.infiniteLoading.$emit('$InfiniteLoading:complete');
			} else {
				this.$http.get('articles/details', {
					params: {
						//this is the argument used
						article_id: this.container.slice(this.distance, this.distance + 20).join(","),
					},
				}).then((res) => {
					if (res.data.length) {
						this.distance = this.distance + res.data.length;
						this.articles = this.articles.concat(res.data);
						this.$refs.infiniteLoading.$emit('$InfiniteLoading:loaded');
						//add waypoint to every article
						setTimeout(() => {
							for (var key in this.articles) {
								var article = this.articles[key];
								//only add triggers if the status is unread
								if (article.status == "unread") {
									//make sure only one waypoint per article is set, check the waypointPool for this
									if (!this.waypointPool.includes(article.id)) {
										this.waypointCreate(article.id);
										this.waypointPool.push(article.id);
									}
								}
							}
						}, 50);
					} else {
						//show complete message and flush remaining items in queue by marking them all as read
						this.$refs.infiniteLoading.$emit('$InfiniteLoading:complete');
						this.flushPool();
					}
				});
			}
		},
		waypointCreate(article) {
			var waypoint = new Waypoint({
				element: document.getElementById(article),
				offset: -150,
				//use the ES2015 arrow syntax to avoid error Cannot read property 'post' of undefined
				handler: (direction) => {
					if (direction == "down") {
						//make ajax request to change bookmark status
						this.markArticleRead(article);
						//destroy after the article has been marked as read
						waypoint.destroy();
					}
				}
			});
		},
		markArticleRead(article) {
			//make ajax request to change read status
			this.$http.post('articles/mark-to-read/' + article).then(response => {
				//push id to the pool
				this.pool.push(article.id);

				//increase the read and unread count based on the body message returned
				for (var i = 0, len = this.$store.categories.length; i < len; i++) {
					if (!(this.$store.categories[i] === undefined || this.$store.categories[i] === null)) {
						if (response.body.category_id == this.$store.categories[i]['id']) {
							if (this.$store.categories[i]['feeds'] != undefined) {
								for (var f = 0, len = this.$store.categories[i]['feeds'].length; f < len; f++) {
									if (response.body.feed_id == this.$store.categories[i]['feeds'][f]['id']) {
										this.$store.categories[i]['feeds'][f]['read_count'] = this.$store.categories[i]['feeds'][f]['read_count'] + 1
										this.$store.categories[i]['feeds'][f]['unread_count'] = this.$store.categories[i]['feeds'][f]['unread_count'] - 1
									}
								}
							}
						}
					}
				}
			}, response => {
				console.log('oops something went wrong');
			});
		},
		bookmark(article, event) {
			//determine if classname already contains bookmarked, if so, the change is unmark
			//TODO: increase decrease bookmark count
			if( event.currentTarget.className.indexOf('bookmarked') >= 0){
				var bookmarkChange = 'unmark';
			} else {
				var bookmarkChange = 'mark';
			}

			//make ajax request to change bookmark status
			this.$http.post('articles/mark-with-star/' + article, {update: bookmarkChange}).then(response => {
				//get status & status text
				console.log(response.status);
				console.log(response.statusText);
			}, response => {
				console.log('oops something went wrong');
			});
		},
		emitSearchEvent: function (search, event) {
			if (!(this.search === undefined || this.search === null)) {
				this.$store.data.search = this.search;
			}
		},
		toggleShowStatus: function() {
			this.showStatusMenu = !this.showStatusMenu;
		},
		toggleShowFilter: function() {
			this.showFilterMenu = !this.showFilterMenu;
		},
		statusClicked: function(status) {
			this.$store.data.status = status;
			this.toggleShowStatus();
		},
		filterClicked: function(filter) {
			this.$store.data.filter = filter;
			this.toggleShowFilter();
		}
	},
	filters: {
		capitalize: function (value) {
			if (!value) return ''
			value = value.toString()
			return value.charAt(0).toUpperCase() + value.slice(1)
		},
		stripHTML: function (value) {
			//strip out all HTML
			var str1 = value.replace(/<(?:.|\n)*?>/gm, '');
			//take first 100 words
			var str2 = str1.replace(/(([^\s]+\s\s*){100})(.*)/,"$1…");
			return str2;
		}
	}
}
</script>
