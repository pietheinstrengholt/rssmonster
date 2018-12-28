<template>
    <div class="quickbar view-toolbar">
		<a @click="$store.modal='showcategories'" id="rssmonster" class="view-button" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true"></a>
        <a v-on:click="loadType('unread')" v-bind:class="{ 'selected':  $store.data.status === 'unread' }" id="unread" class="view-button" title="View unread" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true"><i class="fas fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>Unread {{ this.$store.unreadCount }}</a>
        <a v-on:click="loadType('read')" v-bind:class="{ 'selected':  $store.data.status === 'read' }" id="read" class="view-button selected" title="View read" data-behavior="view_all change_view_mode" data-view-mode="view_all" data-remote="true"><i class="far fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>Read {{ this.$store.readCount }}</a>
        <a v-on:click="loadType('star')" v-bind:class="{ 'selected':  $store.data.status === 'star' }" id="star" class="view-button" title="View starred" data-behavior="view_starred change_view_mode" data-view-mode="view_starred" data-remote="true"><i class="far fa-heart" data-fa-transform="down-0 shrink-0 left-5"></i>Star {{ this.$store.starCount }}</a>
    </div>
</template>

<style>
	div.quickbar a {
		font-size: 12px;
		cursor: pointer;
	}
</style>

<script>
export default {
	store: {
        data: 'data'
	},
	methods: {
		loadType: function (status) {
			this.$store.data.status = status;
		}
	}
}
</script>
