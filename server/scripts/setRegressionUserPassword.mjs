import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';

const { User } = db;
const username = 'semantic-regression-user';
const password = 'rssmonster';

const passwordHash = await bcrypt.hash(password, 10);
const apiHash = crypto.createHash('md5').update(`${username}:${password}`).digest('hex');

const [user, created] = await User.findOrCreate({
  where: { username },
  defaults: {
    username,
    password: passwordHash,
    hash: apiHash,
    role: 'user'
  }
});

if (!created) {
  await user.update({
    password: passwordHash,
    hash: apiHash,
    role: 'user'
  });
}

const isMatch = await bcrypt.compare(password, user.password);
console.log(JSON.stringify({
  username,
  created,
  id: user.id,
  passwordHashStored: Boolean(user.password),
  hashStored: Boolean(user.hash),
  passwordMatches: isMatch,
  passwordHashPreview: user.password.slice(0, 30)
}, null, 2));
