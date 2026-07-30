import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../utils/apiCredentials.js';

const { User } = db;
const username = 'semantic-regression-user';
const password = 'rssmonster';

const passwordHash = await bcrypt.hash(password, 10);
const apiHash = createFeverCredentialHash(
  createFeverApiKey(username, password)
);

const [user, created] = await User.findOrCreate({
  where: { username },
  defaults: {
    username,
    password: passwordHash,
    feverCredentialHash: apiHash,
    role: 'user'
  }
});

if (!created) {
  await user.update({
    password: passwordHash,
    feverCredentialHash: apiHash,
    role: 'user'
  });
}

console.log(JSON.stringify({
  username,
  created,
  id: user.id
}, null, 2));
