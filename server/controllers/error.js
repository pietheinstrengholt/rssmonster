const get404 = (req, res, next) => {
  return res.status(404).json({
    error: 'page not found!'
  });
};

export default {
  get404
}