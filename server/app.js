const bodyParser = require("body-parser");
const express = require("express");
const path = require("path");
const morgan = require('morgan')

//set port
const port = process.env.PORT || 3000

//import sequelize
const sequelize = require("./util/database");

//include models in order to define associations
const Category = require("./models/category");
const Feed = require("./models/feed");
const Article = require("./models/article");
const Setting = require("./models/setting");

//routes
const categoryRoutes = require("./routes/category");
const feedRoutes = require("./routes/feed");
const articleRoutes = require("./routes/article");
const crawlRoutes = require("./routes/crawl");
const managerRoutes = require("./routes/manager");
const settingRoutes = require("./routes/setting");
const feverRoutes = require("./routes/fever");

//controller
const errorController = require("./controllers/error");

const app = express();

app.use(morgan('[:date[clf]] :remote-addr - :method :url -> :status (:response-time ms)'));

//serve the content straight from the distribution folder (output after npm run build)
app.use(express.static("dist"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, POST, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

//serve out the api's
app.use("/api/categories", categoryRoutes);
app.use("/api/feeds", feedRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/crawl", crawlRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/setting", settingRoutes);
app.use("/api/fever", feverRoutes);
app.use(errorController.get404);

//define relationships
Feed.belongsTo(Category, { constraints: true, onDelete: 'CASCADE'});
Category.hasMany(Feed);
Article.belongsTo(Feed), { constraints: true, onDelete: 'CASCADE'};
Feed.hasMany(Article);

sequelize
  .sync({
    //force: true
  })
  .then(result => {
    //console.log(result);
  })
  .catch(err => {
    console.log(err);
  });

app.listen(port, () => {
  console.log(`Server has started on port ${port}!`);
});
