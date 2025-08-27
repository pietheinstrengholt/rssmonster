import User from "../models/user.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from 'node:crypto'

const register = async (req, res, next) => {
    try {        
        // Check if the user already exists
        const user = await User.findOne({ where: { username: req.body.username } });
  
        if (user) {
            return res.status(409).send({
                message: 'This username is already in use!'
            });
        } else {
            console.log("no user found!"); // username is available
              
            // Hash the password
            const hash = await bcrypt.hash(req.body.password, 10);
              
            // Add the new user to the database
            await User.create({
                username: req.body.username,
                password: hash,
                hash: crypto.createHash('md5').update(req.body.username + ":" + req.body.password).digest('hex').toString()
            });
  
            return res.status(201).send({
                message: 'Registered!'
            });
        }  
    } catch (err) {
        console.error(err);
        return res.status(500).send({
            message: err.message || 'An error occurred during registration'
        });
    }  
};

const login = async (req, res, next) => {
    try {
        // Check if the user exists
        const user = await User.findOne({ where: { username: req.body.username } });
        
        if (user) {
            // Compare the provided password with the stored hash
            const isMatch = await bcrypt.compare(req.body.password, user.password);            
            if (!isMatch) {
                return res.status(401).json({ message: "Username or password incorrect!!" });  
            } else {
                //set jwt token
                const token = jwt.sign(
                {
                    username: user.username,
                    userId: user.id,
                },
                'SECRETKEY',
                {
                    expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
                );

                //update the last login date
                user.update({
                    lastLogin: new Date()
                });

                return res.status(200).json({ message: "Connected!", token, user: user });
            }
        } else {
            // Username not found in database
            return res.status(401).send({
                message: 'Username or password incorrect!!'
            });
        }  
    } catch (err) {
        console.error(err);
        return res.status(500).send({
            message: err.message || 'An error occurred during login'  
        });
    }
};

const validate = async (req, res, next) => {

    // Check if the user exists
    const user = await User.findOne({ 
        where: { id: req.userData.userId }, 
        attributes: {
         exclude: ['password']
          }
    });

    if (!user) {
        return res.status(401).json({ message: "User not found!" });
    } else {
        return res.status(200).json({ message: "This is the secret content. Only logged in users can see that!", data: req.userData, user: user  });
    }
};

export default {
  register,
  login,
  validate
}