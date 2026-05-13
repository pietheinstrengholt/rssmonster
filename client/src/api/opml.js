import api from './client';

export const exportOpml = () =>
  api.get('/opml/export', {
    responseType: 'blob'
  });

export const importOpml = (file) => {
  const formData = new FormData();
  formData.append('opmlFile', file);

  return api.post('/opml/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
