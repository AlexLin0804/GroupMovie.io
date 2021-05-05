var express = require('express');
var router = express.Router();

/*
 * GET LOGIN PAGE
 */
router.get('/', function(req, res, next) {
  console.log('user');
  res.render('user.html');
});

// return it to the app
module.exports = router;