<template>
    <div class="modal" tabindex="-1" role="dialog">
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

<style scoped>
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--overlay-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-dialog{
    max-width: 600px;
    width: 100%;
}

.category-icon-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
}

.category-icon-option {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 8px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
}

.category-icon-option:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}

.category-icon-option.selected {
    color: var(--color-primary);
    background: var(--color-primary-soft);
    border-color: var(--color-primary);
}

.category-icon-option :deep(svg) {
    width: 18px;
    height: 18px;
}

:global(:root[data-theme='dark']) {
    .category-icon-option {
        color: var(--text-muted);
        background: var(--bg-control);
        border-color: var(--border-color);
    }

    .category-icon-option:hover {
        color: var(--text-inverted);
        background: var(--bg-hover);
    }

    .category-icon-option.selected {
        color: var(--text-inverted);
        background: var(--bg-selected);
        border-color: var(--bg-selected);
    }
}
</style>

<script>
import { createCategory } from '../../api/categories';
import { setAuthToken } from '../../api/client';
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

                    //add missing count properties, since these are populated dynamically
                    this.category.unreadCount = 0;
                    this.category.readCount = 0;
                    this.category.starCount = 0;
                    this.category.feeds = [];

                    //push the new category to categories in store
                    this.$store.data.categories.push(this.category);

                    //close the modal
                    this.$store.data.setShowModal('');
                } catch (error) {
                    console.log("oops something went wrong", error);
                    this.$store.data.setShowModal('');
                }
            }
        }
    }
}
</script>
