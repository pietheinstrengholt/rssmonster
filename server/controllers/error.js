const get404 = (req, res, _next) => res.status(404).json({
  error: 'page not found!'
});

export default {
  get404
}