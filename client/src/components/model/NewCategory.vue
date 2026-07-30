<template>
    <div class="modal category-dialog" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add new category</h5>
            </div>
            <div class="modal-body">
                <div class="mb-4">
                    <label class="form-label" for="new-category-name">Category name</label>
                    <input id="new-category-name" class="form-control" type="text" placeholder="Enter new category name.." v-model="categoryName">
                </div>
                <div>
                    <div class="form-label mb-2">Category icon</div>
                    <div class="category-icon-grid" role="radiogroup" aria-label="Category icon">
                        <button
                            v-for="icon in iconOptions"
                            :key="icon.name"
                            type="button"
                            class="category-icon-option"
                            :class="{ selected: iconName === icon.name }"
                            role="radio"
                            :aria-checked="iconName === icon.name"
                            :aria-label="icon.label"
                            :title="icon.label"
                            @click="iconName = icon.name"
                        >
                            <BootstrapIcon :icon="icon.name" color="currentColor" />
                        </button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="saveCategory">Add category</button>
                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="$store.data.setShowModal('')">Close</button>
            </div>
            </div>
        </div>
    </div>
</template>

<script>
import './categoryDialog.css';
import { createCategory } from '../../api/categories';
import { setAuthToken } from '../../api/client';
import { notifyActionError } from '../../services/actionNotifications.js';
export default {
    name: 'NewCategory',
    created: function() {
        setAuthToken(this.$store.auth.token);
    },
    data() {
        return {
            categoryName: '',
            iconName: 'folder-fill',
            iconOptions: [
                { name: 'folder-fill', label: 'Folder' },
                { name: 'newspaper', label: 'Newspaper' },
                { name: 'cpu-fill', label: 'Technology' },
                { name: 'robot', label: 'Robotics' },
                { name: 'file-code-fill', label: 'Development' },
                { name: 'cloud-fill', label: 'Cloud' },
                { name: 'shield-lock-fill', label: 'Security' },
                { name: 'diagram-3-fill', label: 'Systems' },
                { name: 'bar-chart-fill', label: 'Analytics' },
                { name: 'briefcase-fill', label: 'Business' },
                { name: 'graph-up-arrow', label: 'Markets' },
                { name: 'piggy-bank-fill', label: 'Finance' },
                { name: 'heart-pulse-fill', label: 'Health' },
                { name: 'mortarboard-fill', label: 'Education' },
                { name: 'controller', label: 'Gaming' },
                { name: 'trophy-fill', label: 'Sports' },
                { name: 'camera-reels-fill', label: 'Film' },
                { name: 'music-note-beamed', label: 'Music' },
                { name: 'book-fill', label: 'Books' },
                { name: 'compass-fill', label: 'Travel' },
                { name: 'tools', label: 'Tools' },
                { name: 'rss-fill', label: 'RSS' },
                { name: 'megaphone-fill', label: 'Announcements' },
                { name: 'chat-square-text-fill', label: 'Discussion' }
            ],
            category: {}
        }
    },
    methods: {
        async saveCategory() {
            // Logic to save the new category
            //save category when category name is set
            if (this.categoryName) {
                try {
                    const result = await createCategory(this.categoryName, this.iconName);
                    //create new local category in data object
                    this.category = result.data;

                    // Reconcile the API response through the store's normalization contract.
                    this.$store.data.addCategory(this.category);

                    //close the modal
                    this.$store.data.setShowModal('');
                } catch (error) {
                    console.error(`Error creating category "${this.categoryName}":`, error);
                    notifyActionError('Could not create this category. Please try again.', error);
                }
            }
        }
    }
}
</script>
