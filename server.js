import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import User from "./models/user.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import { Server } from "socket.io";
import http from "http";
import Message from "./models/message.js";
import multer from "multer";
import cloudinary from "./utils/cloudinary.js";
import fs from "fs";
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));

const upload = multer({ dest: "uploads/" });
app.use("/api", authRoutes);

const onlineUsers = new Map();
io.on("connection", (socket) => {
  console.log("a new user connected", socket.id);

  socket.on("join", async (userId) => {
    console.log(`user ${userId} is online with socket id ${socket.id}`);
    onlineUsers.set(userId, socket.id);

    const users = await User.find({
      _id: { $in: Array.from(onlineUsers.keys()) },
    }).select("name _id profilePic");
    io.emit("online-users", users);
  });

  socket.on("send-message", async ({ senderID, receiverID, content }) => {
    const message = new Message({
      senderID,
      receiverID,
      content,
      timestamp: Date.now(),
    });
    await message.save();
    const receiverSocketId = onlineUsers.get(receiverID);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receive-message", {
        senderID,
        content,
        timestamp: message.timestamp,
      });
    }
  });

  socket.on("typing", ({ senderID, receiverID }) => {
    const receiverSocketId = onlineUsers.get(receiverID);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderID });
    }
  });

  socket.on("stop-typing", ({ senderID, receiverID }) => {
    const receiverSocketId = onlineUsers.get(receiverID);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stop-typing", { senderID });
    }
  });
  socket.on("markMessagesAsRead", async ({ from, to }) => {
    // Mark all messages from "from" to "to" as read in DB
    await Message.updateMany(
      { senderID: from, receiverID: to, isRead: false },
      { isRead: true }
    );

    // You could emit a socket event back if needed
    const receiverSocketId = onlineUsers.get(from);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messages-seen", { by: to });
    }
  });

  socket.on("disconnect", async () => {
    for (const [userId, sId] of onlineUsers.entries()) {
      if (sId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    const users = await User.find({
      _id: { $in: Array.from(onlineUsers.keys()) },
    }).select("name _id");
    io.emit("online-users", users);
    console.log("a user disconnected", socket.id);
  });
});

mongoose
  .connect("mongodb://localhost:27017/qurioDB")
  .then(() => console.log("database connected"));

app.get("/", (req, res) => {
  res.send("server working");
});

app.get("/user", isLoggedIn, async (req, res) => {
  try {
    const foundUser = await User.findById(req.user.id);

    if (!foundUser) return res.status(404).json({ error: "user not foud" });
    // console.log(foundUser);

    res.status(200).json({ user: foundUser });
  } catch (error) {
    res.status(401).json({ error: "invalid token" });
  }
});

app.get("/messages/:friendId", isLoggedIn, async (req, res) => {
  const userId = req.user.id;

  const messages = await Message.find({
    $or: [
      { senderID: userId, receiverID: req.params.friendId },
      { senderID: req.params.friendId, receiverID: userId },
    ],
  }).sort({ timestamp: 1 });

  res.json(messages);
});



app.get("/chat-previews", isLoggedIn, async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);

  try {
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [{ senderID: userId }, { receiverID: userId }],
        },
      },
      {
        $sort: { timestamp: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$senderID", userId] }, "$receiverID", "$senderID"],
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiverID", userId] },
                    { $eq: ["$isRead", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users", // your MongoDB collection name
          localField: "_id", // the friend ID (_id here is the friend ID)
          foreignField: "_id",
          as: "friend",
        },
      },
      {
        $unwind: "$friend",
      },
      {
        $project: {
          _id: 0,
          friend: {
            _id: 1,
            name: 1,
            username: 1,
            email: 1,
            profilePic : 1 ,
          },
          lastMessage: 1,
          unreadCount: 1,
        },
      },
    ]);
    console.log(messages);

    res.json(messages);
  } catch (err) {
    console.error("Error in /chat-previews:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});
app.post("/change/avatar", isLoggedIn, upload.single("avatar"),
  async (req, res) => {
    try {
      console.log("uploading");
      console.log(req.file);

      const foundUser = await User.findById(req.user.id);
      if (!foundUser) return res.status(404).json({ message: "User not found" });
      console.log(foundUser);
      
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "Qurio",
      });
      console.log(result);

      let fileURL = req.file ? result.secure_url : "./src/assets/default_profile_pic.jpg";
      fs.unlinkSync(req.file.path);
      foundUser.profilePic = fileURL;
      await foundUser.save();
      res
        .status(201)
        .json({ message: "avatar uploaded successfully", user: foundUser });
    } catch (error) {
      return res.status(500).json({ error: "Error uploading avatar." });
    }
  }
);
app.post("/delete/user/account", isLoggedIn, async (req, res) => {
    try {
      const {userID} = req.body
      console.log("delete request");
      
      if(userID !== req.user.id) return res.status(404).json({ message: "User not found" });

      const foundUser = await User.findById(req.user.id);
      if (!foundUser) return res.status(404).json({ message: "User not found" });
      console.log(foundUser);
      
      const result = await User.deleteOne({_id: userID})
    
      res
        .status(201)
        .json({ message: "Account deleted successfully" });
    } catch (error) {
      return res.status(500).json({ error: "server error." });
    }
  }
);

function isLoggedIn(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(401).json({ error: "invalid token" });
  }
}

server.listen(3000, () => {
  console.log("server started");
});

// app.post("/register" ,async (req,res)=>{
//     console.log(req.body);

//     try {

//         const {email, password , name} = req.body
//         if (!email || !password || !name) {
//             return res.status(400).json({ error: "All fields are required" });
//         }
//         const existingUser = await User.findOne({email});
//         if (existingUser) return res.status(409).json({error: "Email already registered"})

//         const hashedPassword = await bcrypt.hash(password,10)
//         console.log(hashedPassword);

//         const newUser = await User.create({
//             email,
//             password: hashedPassword,
//             name
//         })
//         console.log(newUser);
//         const token = jwt.sign({id : newUser._id},process.env.JWT_SECRET)
//         console.log(token);
//         res.status(201).cookie("token" , token).json({message: "Registered successfully" , user: newUser})
//     } catch (error) {
//         res.status(500).json({error: error.message})
//     }
// })

// app.post("/login" , async (req,res)=>{
//     try {
//         const {email,password} = req.body
//         if (!email || !password) {
//             return res.status(400).json({ error: "Email and password are required" });
//           }
//         const foundUser = await User.findOne({email})
//         if(!foundUser) return res.status(404).json({error: "user not found"})

//         const isMatch =await bcrypt.compare(password , foundUser.password)
//         if(!isMatch) return res.status(401).json({error: "incorrect password"})

//         const token = jwt.sign({id:foundUser._id} , process.env.JWT_SECRET)
//         res.status(200).cookie("token" , token).json({message:"Logged in successfully" , user: foundUser})
//     } catch (error) {
//         res.status(500).json({error: error.message})
//     }
// })
