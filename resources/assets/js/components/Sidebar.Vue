<template>
	<div class="feeds-inner">
		<div class="drag">
			<div class="sidebar-category-sub" v-on:click="loadAll()">
				<div class="glyphicon">
					<span class="glyphicon glyphicon-tree-deciduous" aria-hidden="true"></span>
				</div>
				<div class="title">All</div>
				<div class="badge-unread">
					<span class="badge">-</span>
				</div>
			</div>
			<draggable v-model="categories" class="dragArea" :options="{group:{ name:'category', pull:'clone', put:false}}" @end="updateSortOrder">
				<div class="sidebar-category-main" v-on:click="loadCategory(category.id)" v-bind:id="category.id" v-for="(category, index) in categories" :key="index">
					<div class="sidebar-category-sub">
						<div class="glyphicon">
							<span class="glyphicon glyphicon-unchecked" aria-hidden="true"></span>
						</div>
						<div class="title">{{category.name}}</div>
						<div class="badge-unread">
							<span class="badge">{{category.unread_count}}</span>
						</div>
					</div>
					<div v-if="category.feeds" class="sidebar-category-feeds">
						<div class="sidebar-category-feed" v-on:click="loadFeed(feed.id)" v-bind:id="feed.id" v-for="(feed, index) in category.feeds" :key="index">
							<div class="glyphicon">
								<span class="glyphicon glyphicon-certificate" aria-hidden="true"></span>
							</div>
							<div class="title">{{feed.feed_name}}</div>
							<div class="badge-unread">
								<span class="badge">{{feed.unread_count}}</span>
							</div>
						</div>
					</div>
				</div>
			</draggable>
		</div>
	</div>
</template>

<style>
.view-toolbar {
	width: 100%;
	background-color: #eff1f3;
	display: -webkit-box;
	display: -webkit-flex;
	display: -ms-flexbox;
	display: flex;
	height: 41px;
	border-bottom: 1px solid transparent;
	border-color: #dcdee0;
	position: absolute;
}

.view-button {
	-webkit-box-flex: 1;
	-webkit-flex: 1;
	-ms-flex: 1;
	flex: 1;
	text-align: center;
	line-height: 41px;
	height: 100%;
	text-decoration: none;
	display: block;
	font-size: 10px;
	text-transform: uppercase;
	font-weight: bold;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
	border-left: 1px solid transparent;
	border-color: #dcdee0;
	color: #b4b6b8;
}

.feeds-droppable {
	background-color: #eff1f3;
	position: absolute;
	top: 41px;
	bottom: 0;
	left: 0;
	right: 0;
	overflow-y: auto;
	overflow-x: hidden;
	-webkit-overflow-scrolling: touch;
}

.normal {
	background-color: grey;
}

.drag {
	background-color: #eff1f3;
	margin-top:41px;
	position: absolute;
	width:100%;
}

.dragArea {
	min-height: 20px;
}

div.sidebar-category-sub, div.sidebar-category-feed {
	padding: 4px;
}

span.badge {
	float: right;
	color: #7a7c7e;
	font-weight: 100;
	background-color: transparent !important;
}

sidebar-category-main {
	width: 100%;
}

div.badge-unread {
	float:right;
}

div.title {
	text-overflow: ellipsis;
	overflow:hidden;
	white-space:nowrap;
	display: inline-block;
}

div.glyphicon {
	float:left;
	margin-right:3px;
}
</style>

<script>
import draggable from 'vuedraggable';

export default {
	data() {
		return {
			categories: [],
			categoriesOrder: []
		}
	},
	store: {
        data: 'data'
	},
	components: {
		draggable
	},
	created: function () {
		this.fetchCategories();
	},
	methods: {
		fetchCategories: function() {
			this.$http.get('http://localhost/rssmonster/public/api/category')
			.then(response => {
				return response.json();
			})
			.then(data => {
				this.categories = data;
			});
		},
		loadAll: function () {
			this.$store.data.category = null;
			this.$store.data.feed = null;
		},
		loadCategory: function (category, event) {
			this.$store.data.category = category;
		},
		loadFeed: function (feed, event) {
			this.$store.data.feed = feed;
		},
		updateSortOrder(e) {
			var orderList = new Array();
			for (let i = 0; i < this.categories.length; i++) {
				orderList.push(this.categories[i]['id']);
			}
			this.$http.post('http://localhost/rssmonster/public/api/category/updateorder', {
					params: {
						//this is the argument used
						order: orderList,
					},
				}).then(response => {
					//get status & status text
					console.log(response.status);
				}, response => {
					console.log('oops something went wrong');
				});
		}

	},
	computed: {
		orderList() {
			var orderList = new Array();
			this.categories.forEach(function(category) {
				orderList.push(category.id);
			});
			this.categoriesOrder = orderList;
			return orderList;
		}
	}
}
</script>
