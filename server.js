'use strict';

require('dotenv').config();

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const cors = require('cors');

const mongoose = require('mongoose')

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// Not found middleware
app.use((err, req, res, next) => {
  if (!req.route) return next({ status: 404, message: 'not found' });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || 'Internal Server Error';
  }
  res.status(errCode).type('txt')
    .send(errMessage)
});

const db = mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const userSchema = new mongoose.Schema({
  username: String
});

const exerciseSchema = new mongoose.Schema({
  username: String,
  description: String,
  duration: Number,
  date: String
});

const db_users = mongoose.model('tracker_users', userSchema);
const db_exercises = mongoose.model('tracker_exercises', exerciseSchema);

app.post('/api/exercise/new-user', (req, res, next) => {
  const { username } = req.body;
  db_users
  .find({ username }, (err, data) => {
    if (err) {
      console.log(err);
      return res.json({ error: `new-user error`});
    }
    if (data.length > 0) {
      return res.json({ error: `user with this username already exists`});
    } else {
      db_users.create({ username }, (err, data) => {
        if (err) {
          console.log(err);
          return res.json({ error: `error while creating new user` });
        }
        return res.json({ username, _id: data._id });
      })
    }
  });
});

app.post('/api/exercise/add',
  (req, res, next) => {
    const { userId } = req.body;

    db_users
    .findById(userId, (err, data) => {
      if (err) {
        console.log(`error in db_users.findById(): ${err}`);
        return res.json({ error: `error in db` });
      }
      if (data == null) {
        return res.json({ error: `no such user` });
      }
      req.body.user = data;
      req.body.username = data.username;
      return next();
    });
  },
  (req, res, next) => {
    let { date } = req.body;
    if (!date) date = new Date().toDateString();
    else date = new Date(date).toDateString();

    const { username, description } = req.body;
    const duration = Number(req.body.duration);

    const exercise = {
      username,
      description,
      duration,
      date
    };

    db_exercises.create(exercise, (err, data) => {
      if (err) {
        console.log(err);
        return res.json({ error: `error adding new exercise` });
      }
      const { username, _id } = req.body.user;
      const { description, duration, date } = data;
      const expected = {
        username,
        _id,
        description,
        duration,
        date
      };

      return res.json(expected);
    });
  }
);

app.route('/api/exercise/users')
.get((req, res) => {
  db_users.find({},
    (err, data) => {
      if (err) {
        console.log(`error GET /api/exercise/users: ${err}`);
        return res.json({ error: `searching for users` });
      }
      res.send(data);
  });
});

app.route('/api/exercise/log')
.get(
  (req, res, next) => {
    const { userId } = req.query;

    db_users.findById(userId, (err, data) => {
      if (err) {
        console.log(`error in db_users.findById(): ${err}`);
        return res.json({ error: `error in db` });
      }
      if (data == null) {
        return res.json({ error: `no such user` });
      }
      req.body.user = data;
      req.body.username = data.username;
      return next();
    })
  },
  (req, res, next) => {
    const { username } = req.body;

    db_exercises.find({ username }, (err, data) => {
      if (err) {
        console.log(err);
        return res.json({ error: `no exercises for this user` });
      }
      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const { from, to, limit } = req.query;
      if (from) data = data.filter(o => new Date(o.date).getTime() >= new Date(from).getTime());
      if (to) data = data.filter(o => new Date(o.date).getTime() <= new Date(to).getTime());
      if (limit) data = data.slice(-limit);

      req.body.log = data;
      req.body.count = data.length;

      return next();
    });
  },
  (req, res) => {
    const result = Object.assign({}, req.body.user);
    result.count = req.body.count;
    result.log = req.body.log;

    return res.json(result);
  }
);

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port);
})
