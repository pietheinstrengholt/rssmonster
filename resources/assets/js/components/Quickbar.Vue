<template>
    <div class="quickbar view-toolbar">
        <a v-on:click="loadType('unread')" id="unread" class="view-button" title="View unread" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true" style="color: rgb(51, 51, 51);">Unread</a>
        <a v-on:click="loadType('star')" id="star" class="view-button" title="View starred" data-behavior="view_starred change_view_mode" data-view-mode="view_starred" data-remote="true">Starred</a>
        <a v-on:click="loadType('read')" id="read" class="view-button selected" title="View all" data-behavior="view_all change_view_mode" data-view-mode="view_all" data-remote="true">Read</a>
    </div>
</template>

<script>
import draggable from 'vuedraggable';

export default {
	store: {
        data: 'data'
	},
	methods: {
		loadType: function (type, event) {
			this.$store.data.type = type;
		}

	}
}
</script>
