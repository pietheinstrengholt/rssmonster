<template>
  <div>
    <h5>Actions</h5>

    <!-- Actions overview modal -->
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Actions Overview</h5>
                </div>
                <div class="modal-body">
                    <!-- Info text -->
                    <div class="alert alert-info mb-3">
                        <p class="mb-2">
                            <strong>How Actions work:</strong>
                        </p>
                        <p class="mb-2">
                            Actions automatically process incoming articles <em>during the crawl</em> based on regular expression patterns. 
                            When an article's content or title matches your pattern, the specified action is applied immediately.
                        </p>
                        <p class="mb-2">
                            <strong>Available action types:</strong>
                        </p>
                        <ul class="mb-2">
                            <li><strong>Delete:</strong> Prevents the article from being saved (takes precedence over all other actions).</li>
                            <li><strong>Star:</strong> Marks the article as important/starred.</li>
                            <li><strong>Read:</strong> Automatically marks the article as read.</li>
                            <li><strong>Clicked:</strong> Sets the "read later" indicator.</li>
                            <li><strong>Mark as advertisement:</strong> Overrides the advertisement score to 100.</li>
                            <li><strong>Mark as low quality:</strong> Overrides the quality score to 100.</li>
                            <li><strong>Assign tag:</strong> Adds a custom tag to the article.</li>
                        </ul>
                        <p class="mb-0">
                            <strong>Performance tip:</strong> Delete actions are processed <em>before</em> AI analysis, 
                            saving API costs by skipping unwanted content early.
                        </p>
                    </div>

                    <div class="settings-group">
                        <label>
                            Actions
                            <span class="info-icon" :title="'Define automated actions based on article content patterns'">
                                <BootstrapIcon icon="info-circle-fill" />
                            </span>
                        </label>
                        
                        <div v-for="(action, index) in actions" :key="index" class="action-row">
                            <div class="action-fields">
                                <div class="form-group">
                                    <label :for="'action-name-' + index" class="small-label">Name</label>
                                    <input 
                                        :id="'action-name-' + index"
                                        v-model="action.name" 
                                        type="text" 
                                        class="form-control" 
                                        placeholder="Action name"
                                    />
                                </div>
                                
                                <div class="form-group">
                                    <label :for="'action-type-' + index" class="small-label">Type</label>
                                    <select 
                                        :id="'action-type-' + index"
                                        v-model="action.actionType" 
                                        class="form-select"
                                    >
                                        <option value="">Select action type</option>
                                        <option value="delete">Delete article</option>
                                        <option value="star">Set starred</option>
                                        <option value="read">Mark as read</option>
                                        <option value="clicked">Mark as clicked</option>
                                        <option value="advertisement">Mark as advertisement</option>
                                        <option value="badquality">Mark as low quality</option>
                                        <option value="tag">Assign tag</option>
                                    </select>
                                </div>

                                <div v-if="action.actionType === 'tag'" class="form-group">
                                    <label :for="'action-tag-' + index" class="small-label">Tag value</label>
                                    <input 
                                        :id="'action-tag-' + index"
                                        v-model="action.tagValue" 
                                        type="text" 
                                        class="form-control" 
                                        placeholder="e.g., important"
                                    />
                                </div>
                                
                                <div class="form-group form-group-full">
                                    <label :for="'action-regex-' + index" class="small-label">Regular Expression</label>
                                    <input 
                                        :id="'action-regex-' + index"
                                        v-model="action.regularExpression" 
                                        type="text" 
                                        class="form-control" 
                                        placeholder="e.g., /keyword|phrase/i"
                                    />
                                </div>
                                
                                <button 
                                    type="button" 
                                    class="btn btn-remove" 
                                    @click="removeAction(index)"
                                    :title="'Remove action'"
                                >
                                    <BootstrapIcon icon="trash-fill" />
                                </button>
                            </div>
                        </div>
                        
                        <button type="button" class="btn btn-add" @click="addAction">
                            <BootstrapIcon icon="plus-circle-fill" />
                            Add Action
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" @click="save">
                        Save
                    </button>
                    <button class="btn btn-secondary" @click="$emit('close')">Close</button>
                </div>
            </div>
        </div>
    </div>

  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
import { fetchActions, saveActions } from '../../api/actions';
import { setAuthToken } from '../../api/client';

export default {
  emits: ['close', 'saved'],
  data() {
    return { 
        actions: []
    };
  },
  async created() {
    setAuthToken(this.$store.auth.token);
    this.fetchActions();
  },
  methods: {
    async fetchActions() {
        try {
            const resp = await fetchActions();
            if (resp && resp.data && Array.isArray(resp.data.actions)) {
                this.actions = resp.data.actions.map(a => ({
                    name: a.name || '',
                    actionType: a.actionType || '',
                    regularExpression: a.regularExpression || '',
                    tagValue: a.tagValue || ''
                }));
            }
        } catch (err) {
            console.error('Failed to fetch actions:', err);
        }
    },
    addAction() {
        this.actions.push({
            name: '',
            actionType: '',
            regularExpression: '',
            tagValue: ''
        });
    },
    removeAction(index) {
        this.actions.splice(index, 1);
    },
    async save() {
        // Persist actions to the server
        const filteredActions = this.actions.filter(a => a && a.actionType && a.actionType.trim() !== '');
        try {
            const resp = await saveActions(filteredActions);
            console.log('Actions saved:', resp.data);
        } catch (err) {
            console.error('Error saving actions:', err);
            alert('Failed to save actions. Please try again.');
        }
        this.$emit('saved');
        this.$emit('close');
    },
    closeActionsModal() {
        this.showActionsModal = false;
    }
  }
};
</script>
