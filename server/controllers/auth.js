import db from '../models/index.js';
const { User } = db;
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from 'node:crypto';

const register = async (req, res, _next) => {
  try {        
    const { username, password } = req.body;

    // Check if the user already exists
    const existingUser = await User.findOne({ where: { username } });

    if (existingUser) {
      return res.status(409).json({
        message: 'This username is already in use!'
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const hash = crypto.createHash('md5')
      .update(`${username}:${password}`)
      .digest('hex');
    
    // Check if this is the first user (will be admin)
    const userCount = await User.count();
    const role = userCount === 0 ? 'admin' : 'user';
    
    // Create the new user
    await User.create({
      username,
      password: hashedPassword,
      hash,
      role
    });

    return res.status(201).json({
      message: 'Registered!'
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during registration'
    });
  }  
};

const login = async (req, res, _next) => {
  try {
    const { username, password } = req.body;

    // Check if the user exists
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Username or password incorrect!' 
      });
    }

    // Compare the provided password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        message: 'Username or password incorrect!' 
      });  
    }

    // Get JWT expiry in seconds (default to 86400 = 1 day)
    const expiresInSeconds = Number(process.env.JWT_EXPIRES_IN) || 86400;

    // Generate JWT token
    const token = jwt.sign(
      {
        username: user.username,
        userId: user.id,
      },
      process.env.JWT_SECRET || 'SECRETKEY',
      {
        expiresIn: expiresInSeconds
      }
    );

    // Update the last login date
    await user.update({
      lastLogin: new Date()
    });

    return res.status(200).json({ 
      message: 'Connected!', 
      token, 
      user,
      expiresInSeconds,
      agenticFeaturesEnabled: Boolean(process.env.OPENAI_API_KEY)
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during login'  
    });
  }
};

const validate = async (req, res, _next) => {
  try {
    // Check if the user exists
    const user = await User.findOne({ 
      where: { id: req.userData.userId }, 
      attributes: {
        exclude: ['password']
      }
    });

    if (!user) {
      return res.status(401).json({ 
        message: 'User not found!' 
      });
    }

    return res.status(200).json({ 
      message: 'This is the secret content. Only logged in users can see that!', 
      data: req.userData, 
      user 
    });
  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during validation'
    });
  }
};

export default {
  register,
  login,
  validate
};