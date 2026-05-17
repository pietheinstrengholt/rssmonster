import api from './client';

/**
 * Download OPML export as a file blob.
 */
export const exportOpml = () =>
  api.get('/opml/export', { responseType: 'blob' });

/**
 * Upload OPML file for import.
 */
export const importOpml = (opmlFile) => {
  const formData = new FormData();
  formData.append('opmlFile', opmlFile);

  return api.post('/opml/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
