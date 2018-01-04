<template>
	<div class="feeds-inner">
		<div class="drag">
			<div class="sidebar-category-sub" v-on:click="loadAll()">
				<span class="glyphicon">
					<i class="fas fa-lightbulb" data-fa-transform="down-5"></i>
				</span>
				<span class="title">All</span>
				<span class="badge-unread">
					<span class="badge">-</span>
				</span>
			</div>
			<draggable v-model="composedCategories" class="dragArea" :options="{group:{ name:'category', pull:'clone', put:false}}" @end="updateSortOrder">
				<div class="sidebar-category-main" v-on:click="loadCategory(category.id)" v-bind:id="category.id" v-for="(category, index) in composedCategories" :key="index">
					<div class="sidebar-category-sub">
						<span class="glyphicon">
							<i class="fas fa-square" data-fa-transform="down-5"></i>
						</span>
						<span class="title">{{category.name}}</span>
						<span class="badge-unread">
							<span v-if="$store.data.status === 'unread'" class="badge">{{category.unread_count}}</span>
							<span v-if="$store.data.status === 'read'" class="badge">{{category.read_count}}</span>
							<span v-if="$store.data.status === 'star'" class="badge">{{category.star_count}}</span>
						</span>
					</div>
					<div v-if="category.feeds" class="sidebar-category-feeds">
						<div class="sidebar-category-feed" v-on:click="loadFeed(feed.id)" v-bind:id="feed.id" v-for="(feed, index) in category.feeds" :key="index">
							<span class="glyphicon">
								<i class="far fa-square" data-fa-transform="down-5"></i>
							</span>
							<span class="title">{{feed.feed_name}}</span>
							<span class="badge-unread">
								<span v-if="$store.data.status === 'unread'" class="badge">{{feed.unread_count}}</span>
								<span v-if="$store.data.status === 'read'" class="badge">{{feed.read_count}}</span>
								<span v-if="$store.data.status === 'star'" class="badge">{{feed.star_count}}</span>
							</span>
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

div.sidebar-category-sub {
	border-bottom: 1px solid #dbdbdb;
}

span.glyphicon {
	float:left;
	margin-right:3px;
}

span.title {
	text-overflow: ellipsis;
	overflow:hidden;
	white-space:nowrap;
	display: block;
	padding-right: 25px;
}

span.badge-unread {
	float:right;
	position: absolute;
	right: 4px;
	margin-top: -19px;
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
			this.$http.get('http://localhost/rssmonster/public/api/categories')
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
			this.$http.post('http://localhost/rssmonster/public/api/categories/updateorder', {
					params: {
						//this is the argument used
						order: orderList,
					},
				}).then(response => {
					//get status & status text
					console.log(response.status);
					//TODO: change order list
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
		},
		composedCategories() {
			var composedCategories = this.categories;
			Object.keys(composedCategories).forEach(function (key) {
				composedCategories[key]['unread_count'] = 0
				composedCategories[key]['read_count'] = 0
				composedCategories[key]['total_count'] = 0
				composedCategories[key]['star_count'] = 0
				var feeds = composedCategories[key]['feeds'];
				Object.keys(feeds).forEach(function (key, id) {
					if (!(composedCategories[key] === undefined || composedCategories[key] === null)) {
						composedCategories[key]['unread_count'] = composedCategories[key]['unread_count'] + feeds[id]['unread_count'];
						composedCategories[key]['read_count'] = composedCategories[key]['read_count'] + feeds[id]['read_count'];
						composedCategories[key]['total_count'] = composedCategories[key]['total_count'] + feeds[id]['total_count'];
						composedCategories[key]['star_count'] = composedCategories[key]['star_count'] + feeds[id]['star_count'];
					}
				});
			});
			return composedCategories;
		}
	}
}
</script>
