exports.get404 = (req, res, next) => {
  //res.status(404).render('404', { pageTitle: 'Page Not Found', path: '/404' });
  console.log('page not found!');
  res.status(404).json({
    error: 'page not found!'
  });
};