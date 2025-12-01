<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Settings</h5>
            </div>
            <div class="modal-body">
                <div class="settings-group">
                    <label for="adScore">
                        Advertisement Score Threshold
                        <span class="info-icon" :title="'Filter out promotional content. 0 = editorial only, 100 = show all including heavy ads/spam'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    <select id="adScore" v-model="advertisementScore" class="form-select">
                        <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>
                
                <div class="settings-group">
                    <label for="sentimentScore">
                        Sentiment Score Threshold
                        <span class="info-icon" :title="'Filter by article tone. 0 = very positive, 50 = neutral, 100 = very negative'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    <select id="sentimentScore" v-model="sentimentScore" class="form-select">
                        <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>
                
                <div class="settings-group">
                    <label for="qualityScore">
                        Quality Score Threshold
                        <span class="info-icon" :title="'Filter by content quality. Lower scores = better depth, accuracy & writing. 0-30 = excellent, 70-100 = poor'">
                            <BootstrapIcon icon="info-circle-fill" />
                        </span>
                    </label>
                    <select id="qualityScore" v-model="qualityScore" class="form-select">
                        <option v-for="value in scoreOptions" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>

                <div class="settings-group">
                    <label>Export Feeds</label>
                    <button type="button" class="btn btn-download" @click="downloadOpml">
                        <BootstrapIcon icon="download" />
                        Download OPML
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="saveSettings">Save</button>
                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="closeModal">Close</button>
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
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
}

.modal-dialog {
    max-width: 600px;
    width: 100%;
}

.modal-content {
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-header {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
}

.modal-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}

.modal-body {
    padding: 15px;
}

.settings-group {
    margin-bottom: 20px;
}

.settings-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    font-size: 14px;
}

.info-icon {
    display: inline-block;
    margin-left: 6px;
    font-size: 14px;
    cursor: help;
    opacity: 0.7;
}

.info-icon:hover {
    opacity: 1;
}

.form-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #dcdee0;
    border-radius: 4px;
    font-size: 14px;
    background-color: #fff;
    cursor: pointer;
}

.form-select:focus {
    outline: none;
    border-color: #2c5aa0;
    box-shadow: 0 0 0 2px rgba(44, 90, 160, 0.1);
}

.modal-footer {
    padding: 15px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
}

.btn-primary {
    background-color: #2c5aa0;
    color: #fff;
}

.btn-primary:hover {
    background-color: #244a85;
}

.btn-secondary {
    background-color: #6c757d;
    color: #fff;
}

.btn-secondary:hover {
    background-color: #5a6268;
}

.btn-download {
    background-color: #28a745;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
}

.btn-download:hover {
    background-color: #218838;
}

@media (prefers-color-scheme: dark) {
    .modal-content {
        background: #2a2a2a;
        color: #fff;
    }

    .modal-header,
    .modal-footer {
        border-color: #444;
    }

    .form-select {
        background-color: #3a3a3a;
        color: #fff;
        border-color: #555;
    }

    .form-select:focus {
        border-color: #4a7fc7;
        box-shadow: 0 0 0 2px rgba(74, 127, 199, 0.2);
    }
}
</style>

<script>
import axios from 'axios';

export default {
    name: 'Settings',
    created() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
        // Initialize dropdowns from store currentSelection values
        const sel = this.$store.data.currentSelection || {};
        if (typeof sel.minAdvertisementScore !== 'undefined') {
            this.advertisementScore = sel.minAdvertisementScore;
        }
        if (typeof sel.minSentimentScore !== 'undefined') {
            this.sentimentScore = sel.minSentimentScore;
        }
        if (typeof sel.minQualityScore !== 'undefined') {
            this.qualityScore = sel.minQualityScore;
        }
    },
    data() {
        return {
            advertisementScore: 100,
            sentimentScore: 100,
            qualityScore: 100,
            scoreOptions: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]
        };
    },
    methods: {
        saveSettings() {
            axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/setting", {
                minAdvertisementScore: this.advertisementScore,
                minSentimentScore: this.sentimentScore,
                minQualityScore: this.qualityScore
            })
            .then(response => {
                console.log('Settings saved successfully:', response.data);
                // Update store currentSelection before closing
                if (this.$store && this.$store.data) {
                    if (typeof this.$store.data.setMinAdvertisementScore === 'function') {
                        this.$store.data.setMinAdvertisementScore(this.advertisementScore);
                    } else {
                        this.$store.data.currentSelection.minAdvertisementScore = this.advertisementScore;
                    }
                    if (typeof this.$store.data.setMinSentimentScore === 'function') {
                        this.$store.data.setMinSentimentScore(this.sentimentScore);
                    } else {
                        this.$store.data.currentSelection.minSentimentScore = this.sentimentScore;
                    }
                    if (typeof this.$store.data.setMinQualityScore === 'function') {
                        this.$store.data.setMinQualityScore(this.qualityScore);
                    } else {
                        this.$store.data.currentSelection.minQualityScore = this.qualityScore;
                    }
                }
                this.$emit('forceReload');
                this.closeModal();
            })
            .catch(error => {
                console.error('Error saving settings:', error);
                alert('Failed to save settings. Please try again.');
            });
        },
        closeModal() {
            this.$emit('close');
        },
        async downloadOpml() {
            try {
                const response = await axios.get(
                    import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/opml/export",
                    { responseType: 'blob' }
                );
                
                // Create blob link to download
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'feeds.opml');
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error downloading OPML:', error);
                alert('Failed to download OPML file. Please try again.');
            }
        }
    }
};
</script>
