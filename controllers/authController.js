import User from "../models/user.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import bcrypt from "bcrypt"
import { registerSchema,loginSchema } from "../validators/userValidator.js";

dotenv.config()
export const loginUser = async (req , res) =>{
    try {

            const {email,password} = loginSchema.parse(req.body)
            
            const foundUser = await User.findOne({email})
            if(!foundUser) return res.status(404).json({error: "user not found"})
                
            const isMatch =await bcrypt.compare(password , foundUser.password)
            if(!isMatch) return res.status(401).json({error: "incorrect password"})
                
            const token = jwt.sign({id:foundUser._id} , process.env.JWT_SECRET)
            res.status(200).cookie("token" , token).json({message:"Logged in successfully" , user: foundUser})
        } catch (error) {
            res.status(500).json({error: error.message})
        }
}

export const registerUser = async (req,res) =>{
     try {
          
            const {email, password , name} = registerSchema.parse(req.body)
            
            const existingUser = await User.findOne({email});
            if (existingUser) return res.status(400).json({error: "Email already registered"})
    
            const hashedPassword = await bcrypt.hash(password,10)
            console.log(hashedPassword);
            
            const newUser = await User.create({
                email,
                password: hashedPassword,
                name ,
                profilePic: "https://res.cloudinary.com/dxpbvp4bj/image/upload/v1752061974/profile_default_kociqs.jpg",
            })
            console.log(newUser);
            const token = jwt.sign({id : newUser._id},process.env.JWT_SECRET)
            console.log(token);
            res.status(201).cookie("token" , token).json({message: "Registered successfully" , user: newUser})
        } catch (error) {
            res.status(500).json({error: error.message})
        }
}
export const logout = (req,res) => {
    res.clearCookie("token").json({message: "logged out successfully"})
}